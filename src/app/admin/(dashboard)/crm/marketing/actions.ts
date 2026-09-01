"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isEmailSuppressed } from "@/lib/crm-email-suppression";
import { isMarketingCampaignType, type MarketingConsentBasis } from "@/lib/crm-marketing-types";

type MarketingActionResult = { error?: string; success?: string };

const ELIGIBLE_STAGES = new Set([
  "Contacted",
  "Interested",
  "Consultation Booked",
  "Proposal or Application Sent",
  "Follow-Up Required",
]);

export async function enrollMarketingContactAction(formData: FormData): Promise<MarketingActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const opportunityId = String(formData.get("opportunity_id") ?? "").trim();
  const campaignType = String(formData.get("campaign_type") ?? "").trim();
  const consentBasis = String(formData.get("consent_basis") ?? "").trim() as MarketingConsentBasis;
  const consentNotes = String(formData.get("consent_notes") ?? "").trim();

  if (!opportunityId) return { error: "Select a contacted business." };
  if (!isMarketingCampaignType(campaignType)) return { error: "Select a valid campaign." };
  if (!["express", "implied"].includes(consentBasis)) return { error: "Select how consent was obtained." };
  if (!consentNotes) return { error: "Record when and how permission or implied consent was established." };

  const { data: opportunity } = await supabase
    .from("crm_opportunities")
    .select("id, business_name, email, stage, opportunity_type")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opportunity) return { error: "Opportunity not found." };
  if (!ELIGIBLE_STAGES.has(opportunity.stage)) return { error: "Only contacted, open opportunities can enter weekly marketing." };
  if (!opportunity.email?.trim()) return { error: "Add an email address to this opportunity before enrolling it." };
  if (campaignType !== opportunity.opportunity_type) {
    return { error: "The campaign must match the service recorded on the opportunity." };
  }
  if (await isEmailSuppressed(opportunity.email)) {
    return { error: "This email address is unsubscribed or suppressed and cannot be enrolled." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("crm_marketing_enrollments").upsert(
    {
      opportunity_id: opportunityId,
      campaign_type: campaignType,
      status: "active",
      consent_basis: consentBasis,
      consent_notes: consentNotes,
      consent_recorded_at: now,
      consent_recorded_by: adminUser.id,
      cadence_days: 7,
      next_send_at: now,
      last_error: null,
      paused_at: null,
      stopped_at: null,
      claim_token: null,
      claimed_at: null,
      created_by: adminUser.id,
      updated_at: now,
    },
    { onConflict: "opportunity_id" }
  );
  if (error) return { error: `Could not enroll this business: ${error.message}` };

  await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: adminUser.id,
    activity_type: "email",
    notes: `Weekly ${campaignType === "business_financing" ? "Business Financing" : campaignType === "lead_generation" ? "Lead Generation" : "Both Services"} marketing activated by ${adminUser.full_name || adminUser.email}. Consent basis: ${consentBasis}.`,
  });

  revalidatePath("/admin/crm/marketing");
  return { success: `${opportunity.business_name} is scheduled for weekly marketing.` };
}

async function updateEnrollmentStatus(
  enrollmentId: string,
  status: "active" | "paused" | "stopped"
): Promise<MarketingActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("crm_marketing_enrollments")
    .select("status, consent_notes, opportunity_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!existing) return { error: "Marketing campaign not found." };

  if (status === "active") {
    if (existing.status === "unsubscribed") return { error: "An unsubscribed campaign cannot be resumed." };
    if (!existing.consent_notes?.trim()) return { error: "A consent record is required before this campaign can resume." };
    const { data: opportunity } = await supabase
      .from("crm_opportunities")
      .select("email, stage")
      .eq("id", existing.opportunity_id)
      .maybeSingle();
    if (!opportunity?.email) return { error: "Add an email address before resuming this campaign." };
    if (["Client Won", "Not Interested"].includes(opportunity.stage)) return { error: `This campaign cannot resume because the opportunity is ${opportunity.stage}.` };
    if (await isEmailSuppressed(opportunity.email)) return { error: "This recipient is unsubscribed or suppressed and cannot be resumed." };
  }

  const updates: Record<string, unknown> = {
    status,
    updated_at: now,
    claim_token: null,
    claimed_at: null,
  };
  if (status === "active") {
    updates.paused_at = null;
    updates.stopped_at = null;
    updates.last_error = null;
    updates.next_send_at = now;
  } else if (status === "paused") {
    updates.paused_at = now;
  } else {
    updates.stopped_at = now;
  }

  const { error } = await supabase.from("crm_marketing_enrollments").update(updates).eq("id", enrollmentId);
  if (error) return { error: `Could not update this campaign: ${error.message}` };
  revalidatePath("/admin/crm/marketing");
  return { success: status === "active" ? "Weekly marketing resumed." : status === "paused" ? "Weekly marketing paused." : "Weekly marketing stopped." };
}

export async function pauseMarketingEnrollmentAction(enrollmentId: string) {
  return updateEnrollmentStatus(enrollmentId, "paused");
}

export async function resumeMarketingEnrollmentAction(enrollmentId: string) {
  return updateEnrollmentStatus(enrollmentId, "active");
}

export async function stopMarketingEnrollmentAction(enrollmentId: string) {
  return updateEnrollmentStatus(enrollmentId, "stopped");
}

export async function updateMarketingTemplateAction(templateId: string, formData: FormData): Promise<MarketingActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const ctaLabel = String(formData.get("cta_label") ?? "").trim();
  if (!subject || !body || !ctaLabel) return { error: "Subject, message, and link label are required." };
  if (subject.length > 160) return { error: "Keep the subject under 160 characters." };

  const { error } = await supabase
    .from("crm_marketing_templates")
    .update({ subject, body, cta_label: ctaLabel, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) return { error: `Could not save the template: ${error.message}` };
  revalidatePath("/admin/crm/marketing");
  return { success: "Marketing email template saved." };
}
