import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getEmailReplyTo, senderForOpportunityType } from "./email-senders";
import { getSiteUrl } from "./site-url";
import { isEmailSuppressed, createUnsubscribeToken } from "./crm-email-suppression";
import { createWinsalotPrefillToken } from "./winsalot-consultation-tokens";
import { getWinsalotBookingUrlBase } from "./send-prospect-email";
import { buildMarketingEmail, firstNameForMarketing } from "./crm-marketing-email";
import type {
  CrmMarketingDeliveryRow,
  CrmMarketingEnrollmentRow,
  CrmMarketingTemplateRow,
  MarketingOpportunitySummary,
} from "./crm-marketing-types";

const MAX_DELIVERY_ATTEMPTS = 3;

export type MarketingJobOutcome = "sent" | "failed" | "skipped" | "would_send";

export type MarketingJobResult = {
  enrollmentId: string;
  opportunityId: string;
  businessName: string;
  recipientEmail: string | null;
  campaignType: string;
  outcome: MarketingJobOutcome;
  error?: string;
};

export type MarketingJobSummary = {
  dryRun: boolean;
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
  results: MarketingJobResult[];
};

async function clearClaim(
  admin: SupabaseClient,
  enrollmentId: string,
  claimToken: string | null,
  updates?: Record<string, unknown>
): Promise<void> {
  let query = admin
    .from("crm_marketing_enrollments")
    .update({ claim_token: null, claimed_at: null, updated_at: new Date().toISOString(), ...(updates ?? {}) })
    .eq("id", enrollmentId);
  if (claimToken) query = query.eq("claim_token", claimToken);
  await query;
}

async function loadDueEnrollments(admin: SupabaseClient, dryRun: boolean, limit: number): Promise<CrmMarketingEnrollmentRow[]> {
  if (dryRun) {
    const { data, error } = await admin
      .from("crm_marketing_enrollments")
      .select("*")
      .eq("status", "active")
      .lte("next_send_at", new Date().toISOString())
      .order("next_send_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to load due marketing contacts: ${error.message}`);
    return (data ?? []) as CrmMarketingEnrollmentRow[];
  }

  const { data, error } = await admin.rpc("claim_due_crm_marketing_enrollments", { p_limit: limit });
  if (error) throw new Error(`Failed to claim due marketing contacts: ${error.message}`);
  return (data ?? []) as CrmMarketingEnrollmentRow[];
}

function templateForEnrollment(
  enrollment: CrmMarketingEnrollmentRow,
  templates: CrmMarketingTemplateRow[]
): CrmMarketingTemplateRow | null {
  const sequence = templates
    .filter((template) => template.campaign_type === enrollment.campaign_type && template.active)
    .sort((a, b) => a.sequence_number - b.sequence_number);
  if (sequence.length === 0) return null;
  return sequence[enrollment.send_count % sequence.length] ?? null;
}

async function prepareDelivery(
  admin: SupabaseClient,
  enrollment: CrmMarketingEnrollmentRow,
  opportunity: MarketingOpportunitySummary,
  template: CrmMarketingTemplateRow,
  toEmail: string,
  subject: string
): Promise<{ delivery: CrmMarketingDeliveryRow | null; processed?: CrmMarketingDeliveryRow; error?: string }> {
  const occurrenceKey = enrollment.next_send_at;
  const { data: existing } = await admin
    .from("crm_marketing_deliveries")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .eq("occurrence_key", occurrenceKey)
    .maybeSingle();

  if (existing) {
    const row = existing as CrmMarketingDeliveryRow;
    if (!["failed", "sending"].includes(row.status)) return { delivery: null, processed: row };
    if (row.attempt_count >= MAX_DELIVERY_ATTEMPTS) {
      return { delivery: null, error: "This weekly email reached the maximum number of delivery attempts." };
    }

    const { data, error } = await admin
      .from("crm_marketing_deliveries")
      .update({
        status: "sending",
        status_at: new Date().toISOString(),
        attempt_count: row.attempt_count + 1,
        error_detail: null,
        failed_at: null,
        subject,
        to_email: toEmail,
        template_id: template.id,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    return error ? { delivery: null, error: error.message } : { delivery: data as CrmMarketingDeliveryRow };
  }

  const { data, error } = await admin
    .from("crm_marketing_deliveries")
    .insert({
      enrollment_id: enrollment.id,
      opportunity_id: opportunity.id,
      template_id: template.id,
      occurrence_key: occurrenceKey,
      scheduled_for: enrollment.next_send_at,
      to_email: toEmail,
      subject,
      status: "sending",
      status_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  return error ? { delivery: null, error: error.message } : { delivery: data as CrmMarketingDeliveryRow };
}

function nextSendAt(cadenceDays: number): string {
  return new Date(Date.now() + cadenceDays * 24 * 60 * 60 * 1000).toISOString();
}

export async function runCrmMarketingJob(options?: { dryRun?: boolean; limit?: number }): Promise<MarketingJobSummary> {
  const dryRun = options?.dryRun ?? false;
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const admin = getSupabaseAdmin();
  const enrollments = await loadDueEnrollments(admin, dryRun, limit);
  const { data: templateRows, error: templatesError } = await admin
    .from("crm_marketing_templates")
    .select("*")
    .eq("active", true)
    .order("sequence_number");
  if (templatesError) throw new Error(`Failed to load marketing templates: ${templatesError.message}`);
  const templates = (templateRows ?? []) as CrmMarketingTemplateRow[];

  const summary: MarketingJobSummary = {
    dryRun,
    candidates: enrollments.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  for (const enrollment of enrollments) {
    const resultBase = {
      enrollmentId: enrollment.id,
      opportunityId: enrollment.opportunity_id,
      campaignType: enrollment.campaign_type,
    };
    const { data: opportunityData, error: opportunityError } = await admin
      .from("crm_opportunities")
      .select("id, business_name, contact_name, email, stage, opportunity_type")
      .eq("id", enrollment.opportunity_id)
      .maybeSingle();
    const opportunity = opportunityData as MarketingOpportunitySummary | null;

    if (opportunityError || !opportunity) {
      if (!dryRun) await clearClaim(admin, enrollment.id, enrollment.claim_token, { status: "stopped", stopped_at: new Date().toISOString(), last_error: "Opportunity no longer exists." });
      summary.skipped++;
      summary.results.push({ ...resultBase, businessName: "Removed opportunity", recipientEmail: null, outcome: "skipped", error: "Opportunity no longer exists." });
      continue;
    }

    if (["Client Won", "Not Interested"].includes(opportunity.stage)) {
      if (!dryRun) await clearClaim(admin, enrollment.id, enrollment.claim_token, { status: "stopped", stopped_at: new Date().toISOString(), last_error: `Campaign stopped because the opportunity is ${opportunity.stage}.` });
      summary.skipped++;
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: opportunity.email, outcome: "skipped", error: `Opportunity is ${opportunity.stage}.` });
      continue;
    }

    const toEmail = opportunity.email?.trim().toLowerCase() ?? "";
    if (!toEmail) {
      if (!dryRun) await clearClaim(admin, enrollment.id, enrollment.claim_token, { status: "paused", paused_at: new Date().toISOString(), last_error: "No email address is saved for this opportunity." });
      summary.skipped++;
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: null, outcome: "skipped", error: "No email address." });
      continue;
    }

    if (await isEmailSuppressed(toEmail)) {
      if (!dryRun) await clearClaim(admin, enrollment.id, enrollment.claim_token, { status: "unsubscribed", stopped_at: new Date().toISOString(), last_error: "The recipient is on the Growth CRM suppression list." });
      summary.skipped++;
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: toEmail, outcome: "skipped", error: "Recipient is unsubscribed." });
      continue;
    }

    const template = templateForEnrollment(enrollment, templates);
    if (!template) {
      if (!dryRun) await clearClaim(admin, enrollment.id, enrollment.claim_token, { status: "paused", paused_at: new Date().toISOString(), last_error: "No active template exists for this campaign." });
      summary.failed++;
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: toEmail, outcome: "failed", error: "No active campaign template." });
      continue;
    }

    let email: ReturnType<typeof buildMarketingEmail>;
    let unsubscribeUrl: string;
    try {
      const baseBookingUrl = getWinsalotBookingUrlBase();
      const prefillToken = dryRun ? "dry-run" : await createWinsalotPrefillToken(opportunity.id);
      const bookingUrl = `${baseBookingUrl}${baseBookingUrl.includes("?") ? "&" : "?"}t=${prefillToken}`;
      const unsubscribeToken = dryRun ? "dry-run" : await createUnsubscribeToken(toEmail, opportunity.id);
      unsubscribeUrl = `${getSiteUrl()}/unsubscribe/${unsubscribeToken}`;
      email = buildMarketingEmail({
        bodyTemplate: template.body,
        subjectTemplate: template.subject,
        firstName: firstNameForMarketing(opportunity.contact_name),
        businessName: opportunity.business_name,
        ctaLabel: template.cta_label,
        bookingUrl,
        unsubscribeUrl,
      });
    } catch (error) {
      const errorDetail = error instanceof Error ? error.message : "Failed to prepare the marketing email.";
      if (!dryRun) await clearClaim(admin, enrollment.id, enrollment.claim_token, { last_error: errorDetail });
      summary.failed++;
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: toEmail, outcome: "failed", error: errorDetail });
      continue;
    }

    if (dryRun) {
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: toEmail, outcome: "would_send" });
      continue;
    }

    const prepared = await prepareDelivery(admin, enrollment, opportunity, template, toEmail, email.subject);
    if (!prepared.delivery) {
      const alreadyProcessed = !prepared.error;
      await clearClaim(
        admin,
        enrollment.id,
        enrollment.claim_token,
        prepared.error
          ? { last_error: prepared.error }
          : prepared.processed
            ? {
                last_sent_at: prepared.processed.sent_at ?? prepared.processed.status_at,
                next_send_at: nextSendAt(enrollment.cadence_days),
                send_count: enrollment.send_count + 1,
                last_error: null,
              }
            : undefined
      );
      if (alreadyProcessed) summary.skipped++;
      else summary.failed++;
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: toEmail, outcome: alreadyProcessed ? "skipped" : "failed", error: prepared.error });
      continue;
    }

    try {
      const { data: sendResult, error: sendError } = await getResendClient().emails.send(
        {
          from: senderForOpportunityType(opportunity.opportunity_type),
          to: toEmail,
          replyTo: getEmailReplyTo(),
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: {
            "List-Unsubscribe": `<mailto:${getEmailReplyTo()}?subject=unsubscribe>, <${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        },
        { idempotencyKey: `crm-marketing-${enrollment.id}-${enrollment.next_send_at}` }
      );

      if (sendError || !sendResult) throw new Error(sendError?.message ?? "Unknown Resend error.");
      const sentAt = new Date().toISOString();
      const { error: deliveryUpdateError } = await admin
        .from("crm_marketing_deliveries")
        .update({ resend_email_id: sendResult.id, status: "sent", status_at: sentAt, sent_at: sentAt, error_detail: null })
        .eq("id", prepared.delivery.id);
      if (deliveryUpdateError) throw new Error(`Email sent but delivery tracking failed: ${deliveryUpdateError.message}`);

      await admin.from("crm_activities").insert({
        opportunity_id: opportunity.id,
        agent_id: null,
        activity_type: "email",
        notes: `Automatic weekly ${enrollment.campaign_type === "business_financing" ? "Business Financing" : enrollment.campaign_type === "lead_generation" ? "Lead Generation" : "Both Services"} marketing email sent to ${toEmail} — "${email.subject}".`,
        occurred_at: sentAt,
      });

      await clearClaim(admin, enrollment.id, enrollment.claim_token, {
        last_sent_at: sentAt,
        next_send_at: nextSendAt(enrollment.cadence_days),
        send_count: enrollment.send_count + 1,
        last_error: null,
      });
      summary.sent++;
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: toEmail, outcome: "sent" });
    } catch (error) {
      const errorDetail = error instanceof Error ? error.message : "Unknown error sending the marketing email.";
      const failedAt = new Date().toISOString();
      await admin
        .from("crm_marketing_deliveries")
        .update({ status: "failed", status_at: failedAt, failed_at: failedAt, error_detail: errorDetail })
        .eq("id", prepared.delivery.id);
      await clearClaim(admin, enrollment.id, enrollment.claim_token, { last_error: errorDetail });
      summary.failed++;
      summary.results.push({ ...resultBase, businessName: opportunity.business_name, recipientEmail: toEmail, outcome: "failed", error: errorDetail });
    }
  }

  return summary;
}
