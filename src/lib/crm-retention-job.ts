import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { isEmailSuppressed } from "./crm-email-suppression";
import { buildRetentionEmail, firstNameForRetention } from "./crm-retention-email";
import { notifyAdmins } from "./crm-retention-notifications";
import type {
  CrmRetentionEmailRow,
  CrmRetentionEnrollmentRow,
  CrmRetentionFollowupRow,
  CrmRetentionTemplateRow,
  RetentionCampaignType,
  RetentionClientSummary,
} from "./crm-retention-types";

const MAX_DELIVERY_ATTEMPTS = 3;

// Email 1 on the day it starts, Email 2 seven days later, Email 3 fourteen
// days later (brief section 4's "Default spacing") - offsets are relative
// to when Re-Engagement started for this client, never to when the
// previous email actually sent, so a late cron run never pushes the whole
// sequence later.
export const RE_ENGAGEMENT_OFFSET_DAYS = [0, 7, 14] as const;

export type RetentionJobOutcome = "sent" | "failed" | "skipped" | "would_send";

export type RetentionJobResult = {
  enrollmentId?: string;
  followupId?: string;
  clientId: string;
  businessName: string;
  recipientEmail: string | null;
  campaignType: RetentionCampaignType;
  outcome: RetentionJobOutcome;
  error?: string;
};

export type RetentionJobSummary = {
  dryRun: boolean;
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
  results: RetentionJobResult[];
};

// Exported (unit-tested - see __tests__/crm-retention-job.test.ts) for the
// exact same reason as crm-marketing-job.ts's templateForEnrollment:
// send_count only advances once per successfully-recorded delivery, so
// this always names the one template due next - a pause/resume never
// changes this calculation, only whether the job reaches this enrollment
// at all.
export function templateForRetentionEnrollment(
  enrollment: Pick<CrmRetentionEnrollmentRow, "campaign_type" | "send_count">,
  templates: CrmRetentionTemplateRow[]
): CrmRetentionTemplateRow | null {
  const sequence = templates
    .filter((template) => template.campaign_type === enrollment.campaign_type && template.active)
    .sort((a, b) => a.sequence_number - b.sequence_number);
  if (sequence.length === 0) return null;
  return sequence[enrollment.send_count % sequence.length] ?? null;
}

export function isClientSuccessSendable(campaignType: RetentionCampaignType, retentionStatus: string): boolean {
  return campaignType === "client_success" && retentionStatus === "active";
}

export function isReEngagementSendable(campaignType: RetentionCampaignType, retentionStatus: string): boolean {
  return campaignType === "re_engagement" && retentionStatus === "re_engagement";
}

// Exported (unit-tested) - null return means the 3-email sequence is done
// (brief: "After Email 3: ... Do not continue sending automatically").
export function reEngagementNextSendAt(startedAtIso: string, emailsSentSoFar: number): string | null {
  if (emailsSentSoFar >= RE_ENGAGEMENT_OFFSET_DAYS.length) return null;
  const startedAtMs = new Date(startedAtIso).getTime();
  return new Date(startedAtMs + RE_ENGAGEMENT_OFFSET_DAYS[emailsSentSoFar] * 24 * 60 * 60 * 1000).toISOString();
}

export function isReEngagementSequenceComplete(emailsSentSoFar: number): boolean {
  return emailsSentSoFar >= RE_ENGAGEMENT_OFFSET_DAYS.length;
}

async function clearEnrollmentClaim(
  admin: SupabaseClient,
  enrollmentId: string,
  claimToken: string | null,
  updates?: Record<string, unknown>
): Promise<void> {
  let query = admin
    .from("crm_retention_enrollments")
    .update({ claim_token: null, claimed_at: null, updated_at: new Date().toISOString(), ...(updates ?? {}) })
    .eq("id", enrollmentId);
  if (claimToken) query = query.eq("claim_token", claimToken);
  await query;
}

async function clearFollowupClaim(
  admin: SupabaseClient,
  followupId: string,
  claimToken: string | null,
  updates?: Record<string, unknown>
): Promise<void> {
  let query = admin
    .from("crm_retention_followups")
    .update({ claim_token: null, claimed_at: null, updated_at: new Date().toISOString(), ...(updates ?? {}) })
    .eq("id", followupId);
  if (claimToken) query = query.eq("claim_token", claimToken);
  await query;
}

async function logEvent(
  admin: SupabaseClient,
  clientId: string,
  enrollmentId: string | null,
  eventType: string,
  notes: string
): Promise<void> {
  await admin.from("crm_retention_events").insert({ client_id: clientId, enrollment_id: enrollmentId, event_type: eventType, notes });
}

async function loadDueEnrollments(admin: SupabaseClient, dryRun: boolean, limit: number): Promise<CrmRetentionEnrollmentRow[]> {
  if (dryRun) {
    const { data, error } = await admin
      .from("crm_retention_enrollments")
      .select("*")
      .is("removed_at", null)
      .or("and(campaign_type.eq.client_success,retention_status.eq.active),and(campaign_type.eq.re_engagement,retention_status.eq.re_engagement)")
      .not("next_send_at", "is", null)
      .lte("next_send_at", new Date().toISOString())
      .order("next_send_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to load due retention contacts: ${error.message}`);
    return (data ?? []) as CrmRetentionEnrollmentRow[];
  }

  const { data, error } = await admin.rpc("claim_due_crm_retention_enrollments", { p_limit: limit });
  if (error) throw new Error(`Failed to claim due retention contacts: ${error.message}`);
  return (data ?? []) as CrmRetentionEnrollmentRow[];
}

async function prepareDelivery(
  admin: SupabaseClient,
  enrollment: CrmRetentionEnrollmentRow,
  template: CrmRetentionTemplateRow,
  toEmail: string,
  subject: string
): Promise<{ delivery: CrmRetentionEmailRow | null; processed?: CrmRetentionEmailRow; error?: string }> {
  const occurrenceKey = enrollment.next_send_at ?? new Date().toISOString();
  const { data: existing } = await admin
    .from("crm_retention_emails")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .eq("occurrence_key", occurrenceKey)
    .maybeSingle();

  if (existing) {
    const row = existing as CrmRetentionEmailRow;
    if (!["failed", "sending"].includes(row.status)) return { delivery: null, processed: row };
    if (row.attempt_count >= MAX_DELIVERY_ATTEMPTS) {
      return { delivery: null, error: "This retention email reached the maximum number of delivery attempts." };
    }
    const { data, error } = await admin
      .from("crm_retention_emails")
      .update({ status: "sending", status_at: new Date().toISOString(), attempt_count: row.attempt_count + 1, error_detail: null, failed_at: null, subject, to_email: toEmail, template_id: template.id })
      .eq("id", row.id)
      .select("*")
      .single();
    return error ? { delivery: null, error: error.message } : { delivery: data as CrmRetentionEmailRow };
  }

  const { data, error } = await admin
    .from("crm_retention_emails")
    .insert({
      enrollment_id: enrollment.id,
      client_id: enrollment.client_id,
      template_id: template.id,
      campaign_type: enrollment.campaign_type,
      occurrence_key: occurrenceKey,
      scheduled_for: occurrenceKey,
      to_email: toEmail,
      subject,
      status: "sending",
      status_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  return error ? { delivery: null, error: error.message } : { delivery: data as CrmRetentionEmailRow };
}

// Handles both Client Success (weekly, rotating 4-week x2 cycle) and
// Re-Engagement (3-email, day 0/7/14) - both are claimed from the same
// crm_retention_enrollments table via claim_due_crm_retention_enrollments,
// and share every idempotency/suppression/send mechanism below. Follow-Up
// is deliberately never processed here - see runCrmRetentionFollowupsJob.
export async function runCrmRetentionCadenceJob(options?: { dryRun?: boolean; limit?: number }): Promise<RetentionJobSummary> {
  const dryRun = options?.dryRun ?? false;
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const admin = getSupabaseAdmin();
  const enrollments = await loadDueEnrollments(admin, dryRun, limit);

  const { data: templateRows, error: templatesError } = await admin.from("crm_retention_templates").select("*").eq("active", true).order("sequence_number");
  if (templatesError) throw new Error(`Failed to load retention templates: ${templatesError.message}`);
  const templates = (templateRows ?? []) as CrmRetentionTemplateRow[];

  const summary: RetentionJobSummary = { dryRun, candidates: enrollments.length, sent: 0, failed: 0, skipped: 0, results: [] };

  for (const enrollment of enrollments) {
    const resultBase = { enrollmentId: enrollment.id, campaignType: enrollment.campaign_type };

    const { data: clientData, error: clientError } = await admin
      .from("crm_clients")
      .select("id, company_name, primary_contact_name, email, status")
      .eq("id", enrollment.client_id)
      .maybeSingle();
    const client = clientData as RetentionClientSummary | null;

    if (clientError || !client) {
      if (!dryRun) await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, { retention_status: "cancelled", stopped_at: new Date().toISOString(), last_error: "Client no longer exists." });
      summary.skipped++;
      summary.results.push({ ...resultBase, clientId: enrollment.client_id, businessName: "Removed client", recipientEmail: null, outcome: "skipped", error: "Client no longer exists." });
      continue;
    }

    if (client.status === "Archived") {
      if (!dryRun) await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, { retention_status: "cancelled", stopped_at: new Date().toISOString(), last_error: "Client is archived." });
      summary.skipped++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: client.email, outcome: "skipped", error: "Client is archived." });
      continue;
    }

    const toEmail = client.email?.trim().toLowerCase() ?? "";
    if (!toEmail) {
      if (!dryRun) await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, { retention_status: "paused", paused_at: new Date().toISOString(), last_error: "No email address is saved for this client." });
      summary.skipped++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: null, outcome: "skipped", error: "No email address." });
      continue;
    }

    if (await isEmailSuppressed(toEmail)) {
      if (!dryRun) {
        await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, { retention_status: "paused", paused_at: new Date().toISOString(), last_error: "The recipient is on the Growth CRM suppression list." });
        await logEvent(admin, client.id, enrollment.id, "paused", "Automatically paused — recipient is on the Growth CRM suppression list.");
        await notifyAdmins(admin, { title: "Client campaign paused", body: `${client.company_name}'s retention campaign was paused because their email is suppressed.`, linkPath: `/admin/crm/retention?client=${client.id}` });
      }
      summary.skipped++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "skipped", error: "Recipient is unsubscribed/suppressed." });
      continue;
    }

    const template = templateForRetentionEnrollment(enrollment, templates);
    if (!template) {
      if (!dryRun) await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, { retention_status: "paused", paused_at: new Date().toISOString(), last_error: "No active template exists for this campaign." });
      summary.failed++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "failed", error: "No active campaign template." });
      continue;
    }

    const email = buildRetentionEmail({
      campaignType: enrollment.campaign_type,
      bodyTemplate: template.body,
      subjectTemplate: template.subject,
      firstName: firstNameForRetention(client.primary_contact_name),
      businessName: client.company_name,
    });

    if (dryRun) {
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "would_send" });
      continue;
    }

    const prepared = await prepareDelivery(admin, enrollment, template, toEmail, email.subject);
    if (!prepared.delivery) {
      const alreadyProcessed = !prepared.error;
      await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, prepared.error ? { last_error: prepared.error } : undefined);
      if (alreadyProcessed) summary.skipped++;
      else summary.failed++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: alreadyProcessed ? "skipped" : "failed", error: prepared.error });
      continue;
    }

    try {
      const { data: sendResult, error: sendError } = await getResendClient().emails.send(
        { from: getEmailSender("growth"), to: toEmail, replyTo: getEmailReplyTo(), subject: email.subject, text: email.text, html: email.html },
        { idempotencyKey: `crm-retention-${enrollment.id}-${enrollment.next_send_at ?? prepared.delivery.occurrence_key}` }
      );
      if (sendError || !sendResult) throw new Error(sendError?.message ?? "Unknown Resend error.");

      const sentAt = new Date().toISOString();
      await admin.from("crm_retention_emails").update({ resend_email_id: sendResult.id, status: "sent", status_at: sentAt, sent_at: sentAt, error_detail: null }).eq("id", prepared.delivery.id);

      const nextSendCount = enrollment.send_count + 1;
      if (enrollment.campaign_type === "client_success") {
        await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, {
          last_sent_at: sentAt,
          next_send_at: new Date(Date.now() + enrollment.cadence_days * 24 * 60 * 60 * 1000).toISOString(),
          send_count: nextSendCount,
          last_error: null,
        });
        await logEvent(admin, client.id, enrollment.id, "client_success_email_sent", `Weekly Client Success email sent to ${toEmail} — "${email.subject}".`);
      } else {
        const startedAt = enrollment.re_engagement_started_at ?? enrollment.created_at;
        const completed = isReEngagementSequenceComplete(nextSendCount);
        const nextSendAt = reEngagementNextSendAt(startedAt, nextSendCount);
        await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, {
          last_sent_at: sentAt,
          next_send_at: nextSendAt,
          send_count: nextSendCount,
          last_error: null,
          ...(completed ? { retention_status: "re_engagement_completed", re_engagement_completed_at: sentAt } : {}),
        });
        await logEvent(admin, client.id, enrollment.id, "re_engagement_email_sent", `Re-Engagement email ${nextSendCount} of 3 sent to ${toEmail} — "${email.subject}".`);
        if (completed) {
          await logEvent(admin, client.id, enrollment.id, "re_engagement_completed", "Re-Engagement sequence completed — no further automatic emails will be sent.");
          await notifyAdmins(admin, { title: "Re-engagement sequence completed", body: `${client.company_name}'s 3-email re-engagement sequence has finished.`, linkPath: `/admin/crm/retention?client=${client.id}` });
        }
      }

      summary.sent++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "sent" });
    } catch (error) {
      const errorDetail = error instanceof Error ? error.message : "Unknown error sending the retention email.";
      const failedAt = new Date().toISOString();
      await admin.from("crm_retention_emails").update({ status: "failed", status_at: failedAt, failed_at: failedAt, error_detail: errorDetail }).eq("id", prepared.delivery.id);
      await clearEnrollmentClaim(admin, enrollment.id, enrollment.claim_token, { last_error: errorDetail });
      await logEvent(admin, client.id, enrollment.id, "delivery_failed", `Retention email to ${toEmail} failed — ${errorDetail}`);
      await notifyAdmins(admin, { title: "Email failed", body: `A retention email to ${client.company_name} (${toEmail}) failed to send.`, linkPath: `/admin/crm/retention?client=${client.id}` });
      summary.failed++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "failed", error: errorDetail });
    }
  }

  return summary;
}

// The Follow-Up campaign's own worker (brief section 3): never a
// recurring cadence, only "when the follow-up date arrives ... allow the
// email to be sent automatically if Auto Send is enabled." Admin
// notifications for a due/overdue follow-up are handled separately by
// sweepRetentionFollowupNotifications (crm-retention-notifications.ts),
// so this only ever fires the actual send.
export async function runCrmRetentionFollowupsJob(options?: { dryRun?: boolean; limit?: number }): Promise<RetentionJobSummary> {
  const dryRun = options?.dryRun ?? false;
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const admin = getSupabaseAdmin();

  let followups: CrmRetentionFollowupRow[];
  if (dryRun) {
    const { data, error } = await admin
      .from("crm_retention_followups")
      .select("*")
      .is("resolved_at", null)
      .is("cancelled_at", null)
      .is("sent_at", null)
      .eq("auto_send", true)
      .lte("follow_up_date", new Date().toISOString().slice(0, 10))
      .limit(limit);
    if (error) throw new Error(`Failed to load due follow-ups: ${error.message}`);
    followups = (data ?? []) as CrmRetentionFollowupRow[];
  } else {
    const { data, error } = await admin.rpc("claim_due_crm_retention_followups", { p_limit: limit });
    if (error) throw new Error(`Failed to claim due follow-ups: ${error.message}`);
    followups = (data ?? []) as CrmRetentionFollowupRow[];
  }

  const { data: templateRows, error: templatesError } = await admin.from("crm_retention_templates").select("*").eq("campaign_type", "follow_up").eq("active", true).order("sequence_number");
  if (templatesError) throw new Error(`Failed to load follow-up templates: ${templatesError.message}`);
  const templates = (templateRows ?? []) as CrmRetentionTemplateRow[];
  const defaultTemplate = templates[0] ?? null;

  const summary: RetentionJobSummary = { dryRun, candidates: followups.length, sent: 0, failed: 0, skipped: 0, results: [] };

  for (const followup of followups) {
    const resultBase = { followupId: followup.id, campaignType: "follow_up" as const };

    const { data: clientData } = await admin.from("crm_clients").select("id, company_name, primary_contact_name, email, status").eq("id", followup.client_id).maybeSingle();
    const client = clientData as RetentionClientSummary | null;

    if (!client || client.status === "Archived") {
      if (!dryRun) await clearFollowupClaim(admin, followup.id, followup.claim_token, { cancelled_at: new Date().toISOString() });
      summary.skipped++;
      summary.results.push({ ...resultBase, clientId: followup.client_id, businessName: client?.company_name ?? "Removed client", recipientEmail: null, outcome: "skipped", error: "Client no longer exists or is archived." });
      continue;
    }

    const toEmail = client.email?.trim().toLowerCase() ?? "";
    const template = followup.template_id ? templates.find((t) => t.id === followup.template_id) ?? defaultTemplate : defaultTemplate;

    if (!toEmail || !template || (await isEmailSuppressed(toEmail))) {
      const reason = !toEmail ? "No email address on file." : !template ? "No active follow-up template." : "Recipient is unsubscribed/suppressed.";
      if (!dryRun) {
        await clearFollowupClaim(admin, followup.id, followup.claim_token);
        await notifyAdmins(admin, { title: "Client requires manual review", body: `${client.company_name}'s follow-up email could not be sent automatically: ${reason}`, linkPath: `/admin/crm/retention?client=${client.id}` });
        await logEvent(admin, client.id, followup.enrollment_id, "manual_review_required", `Follow-up auto-send skipped — ${reason}`);
      }
      summary.skipped++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail || null, outcome: "skipped", error: reason });
      continue;
    }

    const email = buildRetentionEmail({
      campaignType: "follow_up",
      bodyTemplate: template.body,
      subjectTemplate: template.subject,
      firstName: firstNameForRetention(client.primary_contact_name),
      businessName: client.company_name,
    });

    if (dryRun) {
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "would_send" });
      continue;
    }

    const occurrenceKey = followup.id;
    const { data: deliveryRow, error: deliveryError } = await admin
      .from("crm_retention_emails")
      .insert({
        enrollment_id: followup.enrollment_id,
        followup_id: followup.id,
        client_id: client.id,
        template_id: template.id,
        campaign_type: "follow_up",
        occurrence_key: occurrenceKey,
        scheduled_for: new Date().toISOString(),
        to_email: toEmail,
        subject: email.subject,
        status: "sending",
      })
      .select("*")
      .single();

    if (deliveryError || !deliveryRow) {
      await clearFollowupClaim(admin, followup.id, followup.claim_token, { last_error: deliveryError?.message ?? "Unknown error" } as never);
      summary.skipped++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "skipped", error: deliveryError?.message });
      continue;
    }

    try {
      const { data: sendResult, error: sendError } = await getResendClient().emails.send(
        { from: getEmailSender("growth"), to: toEmail, replyTo: getEmailReplyTo(), subject: email.subject, text: email.text, html: email.html },
        { idempotencyKey: `crm-retention-followup-${followup.id}` }
      );
      if (sendError || !sendResult) throw new Error(sendError?.message ?? "Unknown Resend error.");

      const sentAt = new Date().toISOString();
      await admin.from("crm_retention_emails").update({ resend_email_id: sendResult.id, status: "sent", status_at: sentAt, sent_at: sentAt }).eq("id", deliveryRow.id);
      await clearFollowupClaim(admin, followup.id, followup.claim_token, { sent_at: sentAt, last_contact_at: sentAt });
      await logEvent(admin, client.id, followup.enrollment_id, "followup_email_sent", `Follow-up email sent to ${toEmail} — "${email.subject}".`);
      summary.sent++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "sent" });
    } catch (error) {
      const errorDetail = error instanceof Error ? error.message : "Unknown error sending the follow-up email.";
      const failedAt = new Date().toISOString();
      await admin.from("crm_retention_emails").update({ status: "failed", status_at: failedAt, failed_at: failedAt, error_detail: errorDetail }).eq("id", deliveryRow.id);
      await clearFollowupClaim(admin, followup.id, followup.claim_token);
      await logEvent(admin, client.id, followup.enrollment_id, "delivery_failed", `Follow-up email to ${toEmail} failed — ${errorDetail}`);
      await notifyAdmins(admin, { title: "Email failed", body: `The follow-up email to ${client.company_name} (${toEmail}) failed to send.`, linkPath: `/admin/crm/retention?client=${client.id}` });
      summary.failed++;
      summary.results.push({ ...resultBase, clientId: client.id, businessName: client.company_name, recipientEmail: toEmail, outcome: "failed", error: errorDetail });
    }
  }

  return summary;
}

export type ManualSendResult = { success?: string; error?: string };

// "Send Now" for one enrollment's row on the /admin/crm/retention table
// (brief section 1). Client Success/Re-Engagement only - a Follow-Up
// enrollment has no cadence of its own to send from; use sendFollowupNow
// below for its open follow-up instead. Deliberately bypasses the
// next_send_at/date gate (an admin asking to send right now means right
// now), but reuses every other safety check the automatic job applies -
// suppression, a missing email, no active template - and the same
// unique(enrollment_id, occurrence_key) idempotency, keyed off this
// specific manual trigger's timestamp so it can never collide with a
// concurrent automatic send for the same enrollment.
export async function sendRetentionEmailNow(enrollmentId: string): Promise<ManualSendResult> {
  const admin = getSupabaseAdmin();
  const { data: enrollmentData, error: enrollmentError } = await admin.from("crm_retention_enrollments").select("*").eq("id", enrollmentId).maybeSingle();
  if (enrollmentError || !enrollmentData) return { error: "This retention campaign could not be found." };
  const enrollment = enrollmentData as CrmRetentionEnrollmentRow;

  if (enrollment.campaign_type === "follow_up") {
    return { error: "Follow-Up clients don't have a weekly email to send now - use Send Now on their scheduled follow-up instead." };
  }
  if (enrollment.retention_status === "cancelled" || enrollment.retention_status === "re_engagement_completed") {
    return { error: `This campaign is ${enrollment.retention_status === "cancelled" ? "cancelled" : "already completed"} and cannot send another email.` };
  }

  const { data: clientData } = await admin.from("crm_clients").select("id, company_name, primary_contact_name, email, status").eq("id", enrollment.client_id).maybeSingle();
  const client = clientData as RetentionClientSummary | null;
  if (!client) return { error: "The linked client could not be found." };
  const toEmail = client.email?.trim().toLowerCase() ?? "";
  if (!toEmail) return { error: "Add an email address to this client before sending." };
  if (await isEmailSuppressed(toEmail)) return { error: "This email address is unsubscribed/suppressed and cannot be sent to." };

  const { data: templateRows } = await admin.from("crm_retention_templates").select("*").eq("campaign_type", enrollment.campaign_type).eq("active", true).order("sequence_number");
  const template = templateForRetentionEnrollment(enrollment, (templateRows ?? []) as CrmRetentionTemplateRow[]);
  if (!template) return { error: "No active template exists for this campaign." };

  const email = buildRetentionEmail({
    campaignType: enrollment.campaign_type,
    bodyTemplate: template.body,
    subjectTemplate: template.subject,
    firstName: firstNameForRetention(client.primary_contact_name),
    businessName: client.company_name,
  });

  const occurrenceKey = `manual-${new Date().toISOString()}`;
  const { data: deliveryRow, error: deliveryError } = await admin
    .from("crm_retention_emails")
    .insert({ enrollment_id: enrollment.id, client_id: client.id, template_id: template.id, campaign_type: enrollment.campaign_type, occurrence_key: occurrenceKey, to_email: toEmail, subject: email.subject, status: "sending" })
    .select("*")
    .single();
  if (deliveryError || !deliveryRow) return { error: `Could not prepare this email: ${deliveryError?.message}` };

  try {
    const { data: sendResult, error: sendError } = await getResendClient().emails.send(
      { from: getEmailSender("growth"), to: toEmail, replyTo: getEmailReplyTo(), subject: email.subject, text: email.text, html: email.html },
      { idempotencyKey: `crm-retention-manual-${deliveryRow.id}` }
    );
    if (sendError || !sendResult) throw new Error(sendError?.message ?? "Unknown Resend error.");

    const sentAt = new Date().toISOString();
    await admin.from("crm_retention_emails").update({ resend_email_id: sendResult.id, status: "sent", status_at: sentAt, sent_at: sentAt }).eq("id", deliveryRow.id);

    const nextSendCount = enrollment.send_count + 1;
    if (enrollment.campaign_type === "client_success") {
      await admin.from("crm_retention_enrollments").update({ last_sent_at: sentAt, next_send_at: new Date(Date.now() + enrollment.cadence_days * 24 * 60 * 60 * 1000).toISOString(), send_count: nextSendCount, last_error: null, updated_at: sentAt }).eq("id", enrollment.id);
      await logEvent(admin, client.id, enrollment.id, "client_success_email_sent", `Client Success email sent manually to ${toEmail} — "${email.subject}".`);
    } else {
      const startedAt = enrollment.re_engagement_started_at ?? enrollment.created_at;
      const completed = isReEngagementSequenceComplete(nextSendCount);
      await admin
        .from("crm_retention_enrollments")
        .update({ last_sent_at: sentAt, next_send_at: reEngagementNextSendAt(startedAt, nextSendCount), send_count: nextSendCount, last_error: null, updated_at: sentAt, ...(completed ? { retention_status: "re_engagement_completed", re_engagement_completed_at: sentAt } : {}) })
        .eq("id", enrollment.id);
      await logEvent(admin, client.id, enrollment.id, "re_engagement_email_sent", `Re-Engagement email ${nextSendCount} of 3 sent manually to ${toEmail} — "${email.subject}".`);
      if (completed) await logEvent(admin, client.id, enrollment.id, "re_engagement_completed", "Re-Engagement sequence completed — no further automatic emails will be sent.");
    }

    return { success: `Sent "${email.subject}" to ${toEmail}.` };
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : "Unknown error sending the retention email.";
    const failedAt = new Date().toISOString();
    await admin.from("crm_retention_emails").update({ status: "failed", status_at: failedAt, failed_at: failedAt, error_detail: errorDetail }).eq("id", deliveryRow.id);
    await logEvent(admin, client.id, enrollment.id, "delivery_failed", `Retention email to ${toEmail} failed — ${errorDetail}`);
    return { error: `Failed to send: ${errorDetail}` };
  }
}

// "Send Now" for one open follow-up row (brief section 3). Bypasses both
// the follow_up_date gate and Auto Send - an explicit admin click always
// sends immediately, regardless of either setting. Idempotency key is the
// follow-up's own id (never reused across follow-ups, and this function
// is never called from the automatic claim path), so a double-click can
// at most insert a duplicate crm_retention_emails row rather than a
// duplicate Resend send within the same occurrence.
export async function sendFollowupNow(followupId: string): Promise<ManualSendResult> {
  const admin = getSupabaseAdmin();
  const { data: followupData, error: followupError } = await admin.from("crm_retention_followups").select("*").eq("id", followupId).maybeSingle();
  if (followupError || !followupData) return { error: "This follow-up could not be found." };
  const followup = followupData as CrmRetentionFollowupRow;
  if (followup.resolved_at || followup.cancelled_at) return { error: "This follow-up has already been resolved or cancelled." };

  const { data: clientData } = await admin.from("crm_clients").select("id, company_name, primary_contact_name, email, status").eq("id", followup.client_id).maybeSingle();
  const client = clientData as RetentionClientSummary | null;
  if (!client) return { error: "The linked client could not be found." };
  const toEmail = client.email?.trim().toLowerCase() ?? "";
  if (!toEmail) return { error: "Add an email address to this client before sending." };
  if (await isEmailSuppressed(toEmail)) return { error: "This email address is unsubscribed/suppressed and cannot be sent to." };

  const { data: templateRows } = await admin.from("crm_retention_templates").select("*").eq("campaign_type", "follow_up").eq("active", true).order("sequence_number");
  const templates = (templateRows ?? []) as CrmRetentionTemplateRow[];
  const template = followup.template_id ? templates.find((t) => t.id === followup.template_id) ?? templates[0] : templates[0];
  if (!template) return { error: "No active follow-up template exists." };

  const email = buildRetentionEmail({
    campaignType: "follow_up",
    bodyTemplate: template.body,
    subjectTemplate: template.subject,
    firstName: firstNameForRetention(client.primary_contact_name),
    businessName: client.company_name,
  });

  const { data: deliveryRow, error: deliveryError } = await admin
    .from("crm_retention_emails")
    .insert({ enrollment_id: followup.enrollment_id, followup_id: followup.id, client_id: client.id, template_id: template.id, campaign_type: "follow_up", occurrence_key: `${followup.id}-manual-${Date.now()}`, to_email: toEmail, subject: email.subject, status: "sending" })
    .select("*")
    .single();
  if (deliveryError || !deliveryRow) return { error: `Could not prepare this email: ${deliveryError?.message}` };

  try {
    const { data: sendResult, error: sendError } = await getResendClient().emails.send(
      { from: getEmailSender("growth"), to: toEmail, replyTo: getEmailReplyTo(), subject: email.subject, text: email.text, html: email.html },
      { idempotencyKey: `crm-retention-followup-manual-${deliveryRow.id}` }
    );
    if (sendError || !sendResult) throw new Error(sendError?.message ?? "Unknown Resend error.");

    const sentAt = new Date().toISOString();
    await admin.from("crm_retention_emails").update({ resend_email_id: sendResult.id, status: "sent", status_at: sentAt, sent_at: sentAt }).eq("id", deliveryRow.id);
    await admin.from("crm_retention_followups").update({ sent_at: sentAt, last_contact_at: sentAt, updated_at: sentAt }).eq("id", followup.id);
    await logEvent(admin, client.id, followup.enrollment_id, "followup_email_sent", `Follow-up email sent manually to ${toEmail} — "${email.subject}".`);

    return { success: `Sent "${email.subject}" to ${toEmail}.` };
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : "Unknown error sending the follow-up email.";
    const failedAt = new Date().toISOString();
    await admin.from("crm_retention_emails").update({ status: "failed", status_at: failedAt, failed_at: failedAt, error_detail: errorDetail }).eq("id", deliveryRow.id);
    await logEvent(admin, client.id, followup.enrollment_id, "delivery_failed", `Follow-up email to ${toEmail} failed — ${errorDetail}`);
    return { error: `Failed to send: ${errorDetail}` };
  }
}
