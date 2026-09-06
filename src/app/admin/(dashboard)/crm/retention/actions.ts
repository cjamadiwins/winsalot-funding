"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isEmailSuppressed } from "@/lib/crm-email-suppression";
import {
  isRetentionCampaignType,
  RETENTION_CAMPAIGN_LABELS,
  type RetentionCampaignType,
} from "@/lib/crm-retention-types";
import { sendCrmRetentionTestEmail } from "@/lib/send-test-email";
import {
  runCrmRetentionCadenceJob,
  runCrmRetentionFollowupsJob,
  sendFollowupNow,
  sendRetentionEmailNow,
  type RetentionJobSummary,
} from "@/lib/crm-retention-job";

type RetentionActionResult = { error?: string; success?: string };
type RunJobActionResult = RetentionActionResult & { cadence?: RetentionJobSummary; followups?: RetentionJobSummary };

async function logRetentionEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clientId: string,
  enrollmentId: string | null,
  eventType: string,
  notes: string,
  performedBy?: { id: string; name: string }
) {
  await supabase.from("crm_retention_events").insert({
    client_id: clientId,
    enrollment_id: enrollmentId,
    event_type: eventType,
    notes,
    performed_by: performedBy?.id ?? null,
    performed_by_name: performedBy?.name ?? null,
  });
}

// Enroll one client into exactly one of the three campaign types (brief
// section 6 - never automatic, always a deliberate admin choice). Upserts
// on client_id, so re-enrolling an already-enrolled client (e.g. after
// Stop) reuses the same row rather than ever creating a second one for
// the same client - "Do not create duplicate client records" extends
// here to not creating duplicate enrollment rows either.
export async function enrollClientAction(formData: FormData): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const clientId = String(formData.get("client_id") ?? "").trim();
  const campaignType = String(formData.get("campaign_type") ?? "").trim();
  const autoSend = formData.get("auto_send") === "on";
  const startDate = String(formData.get("start_date") ?? "").trim() || new Date().toISOString().slice(0, 10);

  if (!clientId) return { error: "Select a client." };
  if (!isRetentionCampaignType(campaignType)) return { error: "Select a valid campaign." };

  const { data: client } = await supabase.from("crm_clients").select("id, company_name, email, status").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Client not found." };
  if (client.status === "Archived") return { error: "Archived clients cannot be enrolled in retention campaigns." };
  if (!client.email?.trim()) return { error: "Add an email address to this client before enrolling." };
  if (await isEmailSuppressed(client.email)) return { error: "This email address is unsubscribed/suppressed and cannot be enrolled." };

  const now = new Date().toISOString();
  const retentionStatus = campaignType === "client_success" ? "active" : campaignType === "re_engagement" ? "re_engagement" : "follow_up";

  const { data: enrollment, error } = await supabase
    .from("crm_retention_enrollments")
    .upsert(
      {
        client_id: clientId,
        campaign_type: campaignType,
        retention_status: retentionStatus,
        auto_send: autoSend,
        start_date: startDate,
        cadence_days: 7,
        send_count: 0,
        next_send_at: campaignType === "follow_up" ? null : now,
        last_sent_at: null,
        last_error: null,
        claim_token: null,
        claimed_at: null,
        paused_at: null,
        stopped_at: null,
        removed_at: null,
        re_engagement_started_at: campaignType === "re_engagement" ? now : null,
        re_engagement_completed_at: null,
        created_by: adminUser.id,
        updated_by: adminUser.id,
        updated_at: now,
      },
      { onConflict: "client_id" }
    )
    .select("id")
    .single();
  if (error || !enrollment) return { error: `Could not enroll this client: ${error?.message}` };

  await logRetentionEvent(
    supabase,
    clientId,
    enrollment.id,
    "enrolled",
    `Enrolled in ${RETENTION_CAMPAIGN_LABELS[campaignType]} by ${adminUser.full_name || adminUser.email}. Auto Send: ${autoSend ? "On" : "Off"}.`,
    { id: adminUser.id, name: adminUser.full_name || adminUser.email }
  );

  revalidatePath("/admin/crm/retention");
  return { success: `${client.company_name} enrolled in ${RETENTION_CAMPAIGN_LABELS[campaignType]}.` };
}

async function loadEnrollmentForAction(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, enrollmentId: string) {
  const { data } = await supabase.from("crm_retention_enrollments").select("*, crm_clients(company_name)").eq("id", enrollmentId).maybeSingle();
  return data;
}

export async function pauseRetentionAction(enrollmentId: string): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const existing = await loadEnrollmentForAction(supabase, enrollmentId);
  if (!existing) return { error: "Campaign not found." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("crm_retention_enrollments")
    .update({ retention_status: "paused", paused_at: now, claim_token: null, claimed_at: null, updated_at: now, updated_by: adminUser.id })
    .eq("id", enrollmentId);
  if (error) return { error: `Could not pause this campaign: ${error.message}` };

  await logRetentionEvent(supabase, existing.client_id, enrollmentId, "paused", `Paused by ${adminUser.full_name || adminUser.email}.`, { id: adminUser.id, name: adminUser.full_name || adminUser.email });
  revalidatePath("/admin/crm/retention");
  return { success: "Retention campaign paused." };
}

// Resuming re-sets next_send_at to now (same "resume from the current
// send_count, not a catch-up" design as crm-marketing-job.ts's
// reactivateMarketingCampaignAction) - the very next scheduled/manual run
// picks the correct next-in-sequence template based on send_count, which
// pausing never touched.
export async function resumeRetentionAction(enrollmentId: string): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const existing = await loadEnrollmentForAction(supabase, enrollmentId);
  if (!existing) return { error: "Campaign not found." };
  if (existing.campaign_type === "follow_up") return { error: "Follow-Up campaigns resume automatically on their own schedule - there is nothing to resume here." };

  const { data: client } = await supabase.from("crm_clients").select("email, status").eq("id", existing.client_id).maybeSingle();
  if (!client?.email) return { error: "Add an email address before resuming this campaign." };
  if (client.status === "Archived") return { error: "This client is archived and cannot be resumed." };
  if (await isEmailSuppressed(client.email)) return { error: "This recipient is unsubscribed/suppressed and cannot be resumed." };

  const retentionStatus = existing.campaign_type === "client_success" ? "active" : "re_engagement";
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("crm_retention_enrollments")
    .update({ retention_status: retentionStatus, paused_at: null, next_send_at: now, last_error: null, claim_token: null, claimed_at: null, updated_at: now, updated_by: adminUser.id })
    .eq("id", enrollmentId);
  if (error) return { error: `Could not resume this campaign: ${error.message}` };

  await logRetentionEvent(supabase, existing.client_id, enrollmentId, "resumed", `Resumed by ${adminUser.full_name || adminUser.email}.`, { id: adminUser.id, name: adminUser.full_name || adminUser.email });
  revalidatePath("/admin/crm/retention");
  return { success: "Retention campaign resumed." };
}

export async function stopRetentionAction(enrollmentId: string): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const existing = await loadEnrollmentForAction(supabase, enrollmentId);
  if (!existing) return { error: "Campaign not found." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("crm_retention_enrollments")
    .update({ retention_status: "cancelled", stopped_at: now, claim_token: null, claimed_at: null, updated_at: now, updated_by: adminUser.id })
    .eq("id", enrollmentId);
  if (error) return { error: `Could not stop this campaign: ${error.message}` };

  await logRetentionEvent(supabase, existing.client_id, enrollmentId, "stopped", `Stopped by ${adminUser.full_name || adminUser.email}. All future retention emails are cancelled.`, { id: adminUser.id, name: adminUser.full_name || adminUser.email });
  revalidatePath("/admin/crm/retention");
  return { success: "Retention campaign stopped. No further emails will be sent." };
}

// "Remove From Campaign" - same semantics as Email Marketing's
// removeMarketingEnrollmentAction: never deletes the row (crm_retention_emails.enrollment_id
// is `on delete cascade`, which would destroy that client's send history),
// just cancels future sends and hides it from the active list.
export async function removeFromCampaignAction(enrollmentId: string): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const existing = await loadEnrollmentForAction(supabase, enrollmentId);
  if (!existing) return { error: "Campaign not found." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("crm_retention_enrollments")
    .update({ retention_status: "cancelled", stopped_at: now, removed_at: now, claim_token: null, claimed_at: null, updated_at: now, updated_by: adminUser.id })
    .eq("id", enrollmentId);
  if (error) return { error: `Could not remove this client from the campaign: ${error.message}` };

  await logRetentionEvent(supabase, existing.client_id, enrollmentId, "removed_from_campaign", `Removed from campaign by ${adminUser.full_name || adminUser.email}.`, { id: adminUser.id, name: adminUser.full_name || adminUser.email });
  revalidatePath("/admin/crm/retention");
  return { success: "Removed from the campaign. Email history is preserved." };
}

export async function changeCampaignTypeAction(enrollmentId: string, formData: FormData): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const newCampaignType = String(formData.get("campaign_type") ?? "").trim();
  if (!isRetentionCampaignType(newCampaignType)) return { error: "Select a valid campaign." };

  const existing = await loadEnrollmentForAction(supabase, enrollmentId);
  if (!existing) return { error: "Campaign not found." };

  const now = new Date().toISOString();
  const retentionStatus = newCampaignType === "client_success" ? "active" : newCampaignType === "re_engagement" ? "re_engagement" : "follow_up";
  const { error } = await supabase
    .from("crm_retention_enrollments")
    .update({
      campaign_type: newCampaignType,
      retention_status: retentionStatus,
      send_count: 0,
      next_send_at: newCampaignType === "follow_up" ? null : now,
      re_engagement_started_at: newCampaignType === "re_engagement" ? now : null,
      re_engagement_completed_at: null,
      last_error: null,
      claim_token: null,
      claimed_at: null,
      paused_at: null,
      stopped_at: null,
      updated_at: now,
      updated_by: adminUser.id,
    })
    .eq("id", enrollmentId);
  if (error) return { error: `Could not change the campaign type: ${error.message}` };

  await logRetentionEvent(
    supabase,
    existing.client_id,
    enrollmentId,
    "campaign_type_changed",
    `Campaign changed from ${RETENTION_CAMPAIGN_LABELS[existing.campaign_type as RetentionCampaignType]} to ${RETENTION_CAMPAIGN_LABELS[newCampaignType]} by ${adminUser.full_name || adminUser.email}. Starts from the first email in the new sequence.`,
    { id: adminUser.id, name: adminUser.full_name || adminUser.email }
  );
  revalidatePath("/admin/crm/retention");
  return { success: `Campaign type changed to ${RETENTION_CAMPAIGN_LABELS[newCampaignType]}.` };
}

export async function sendRetentionEmailNowAction(enrollmentId: string): Promise<RetentionActionResult> {
  await requireCrmAdmin();
  const result = await sendRetentionEmailNow(enrollmentId);
  if (result.success) revalidatePath("/admin/crm/retention");
  return result;
}

// ---------------------------------------------------------------------
// Follow-Up campaign (brief section 3).
// ---------------------------------------------------------------------

// Schedules (or reschedules) a client's follow-up. Ensures a
// crm_retention_enrollments row exists with campaign_type='follow_up' -
// the enrollment is the source of truth for "this client is currently in
// the Follow-Up campaign and not receiving weekly Client Success emails";
// the follow-up row itself only carries the date/reason/note/assignment.
// The partial unique index (crm_retention_followups_one_open_per_client)
// guarantees at most one open follow-up per client, so this can never
// create a duplicate scheduled follow-up - resubmitting the form just
// updates the existing open row instead of inserting a second one.
export async function scheduleFollowupAction(formData: FormData): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const clientId = String(formData.get("client_id") ?? "").trim();
  const followUpDate = String(formData.get("follow_up_date") ?? "").trim();
  const followUpReason = String(formData.get("follow_up_reason") ?? "").trim();
  const internalNote = String(formData.get("internal_note") ?? "").trim();
  const assignedAdmin = String(formData.get("assigned_admin") ?? "").trim();
  const autoSend = formData.get("auto_send") === "on";

  if (!clientId) return { error: "Select a client." };
  if (!followUpDate) return { error: "Select a follow-up date." };
  if (!followUpReason) return { error: "Enter a follow-up reason." };

  const { data: client } = await supabase.from("crm_clients").select("id, company_name, status").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Client not found." };
  if (client.status === "Archived") return { error: "Archived clients cannot be scheduled for follow-up." };

  const now = new Date().toISOString();
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("crm_retention_enrollments")
    .upsert(
      { client_id: clientId, campaign_type: "follow_up", retention_status: "follow_up", next_send_at: null, last_error: null, claim_token: null, claimed_at: null, created_by: adminUser.id, updated_by: adminUser.id, updated_at: now },
      { onConflict: "client_id" }
    )
    .select("id")
    .single();
  if (enrollmentError || !enrollment) return { error: `Could not update this client's retention status: ${enrollmentError?.message}` };

  const { data: existingOpen } = await supabase.from("crm_retention_followups").select("id").eq("client_id", clientId).is("resolved_at", null).is("cancelled_at", null).maybeSingle();

  const payload = {
    client_id: clientId,
    enrollment_id: enrollment.id,
    follow_up_date: followUpDate,
    follow_up_reason: followUpReason,
    internal_note: internalNote || null,
    assigned_admin: assignedAdmin || null,
    auto_send: autoSend,
    sent_at: null,
    claim_token: null,
    claimed_at: null,
    updated_at: now,
  };

  const { error } = existingOpen
    ? await supabase.from("crm_retention_followups").update(payload).eq("id", existingOpen.id)
    : await supabase.from("crm_retention_followups").insert({ ...payload, created_by: adminUser.id });
  if (error) return { error: `Could not schedule the follow-up: ${error.message}` };

  await logRetentionEvent(
    supabase,
    clientId,
    enrollment.id,
    "followup_scheduled",
    `Follow-up scheduled for ${followUpDate} by ${adminUser.full_name || adminUser.email}. Reason: ${followUpReason}.`,
    { id: adminUser.id, name: adminUser.full_name || adminUser.email }
  );
  revalidatePath("/admin/crm/retention");
  return { success: `Follow-up scheduled for ${client.company_name} on ${followUpDate}.` };
}

export async function resolveFollowupAction(followupId: string): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("crm_retention_followups").select("client_id, enrollment_id").eq("id", followupId).maybeSingle();
  if (!existing) return { error: "Follow-up not found." };

  const now = new Date().toISOString();
  const { error } = await supabase.from("crm_retention_followups").update({ resolved_at: now, last_contact_at: now, updated_at: now }).eq("id", followupId);
  if (error) return { error: `Could not resolve this follow-up: ${error.message}` };

  await logRetentionEvent(supabase, existing.client_id, existing.enrollment_id, "followup_resolved", `Follow-up marked resolved by ${adminUser.full_name || adminUser.email}.`, { id: adminUser.id, name: adminUser.full_name || adminUser.email });
  revalidatePath("/admin/crm/retention");
  return { success: "Follow-up resolved." };
}

export async function cancelFollowupAction(followupId: string): Promise<RetentionActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("crm_retention_followups").select("client_id, enrollment_id").eq("id", followupId).maybeSingle();
  if (!existing) return { error: "Follow-up not found." };

  const now = new Date().toISOString();
  const { error } = await supabase.from("crm_retention_followups").update({ cancelled_at: now, updated_at: now }).eq("id", followupId);
  if (error) return { error: `Could not cancel this follow-up: ${error.message}` };

  await logRetentionEvent(supabase, existing.client_id, existing.enrollment_id, "followup_cancelled", `Follow-up cancelled by ${adminUser.full_name || adminUser.email}.`, { id: adminUser.id, name: adminUser.full_name || adminUser.email });
  revalidatePath("/admin/crm/retention");
  return { success: "Follow-up cancelled." };
}

export async function sendFollowupNowAction(followupId: string): Promise<RetentionActionResult> {
  await requireCrmAdmin();
  const result = await sendFollowupNow(followupId);
  if (result.success) revalidatePath("/admin/crm/retention");
  return result;
}

// ---------------------------------------------------------------------
// Templates (brief section 8).
// ---------------------------------------------------------------------

export async function updateRetentionTemplateAction(templateId: string, formData: FormData): Promise<RetentionActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) return { error: "Subject and message are required." };
  if (subject.length > 160) return { error: "Keep the subject under 160 characters." };

  const { error } = await supabase.from("crm_retention_templates").update({ subject, body, updated_at: new Date().toISOString() }).eq("id", templateId);
  if (error) return { error: `Could not save the template: ${error.message}` };
  revalidatePath("/admin/crm/retention");
  return { success: "Retention email template saved." };
}

export async function restoreDefaultTemplateAction(templateId: string, defaultSubject: string, defaultBody: string): Promise<RetentionActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_retention_templates").update({ subject: defaultSubject, body: defaultBody, updated_at: new Date().toISOString() }).eq("id", templateId);
  if (error) return { error: `Could not restore the default template: ${error.message}` };
  revalidatePath("/admin/crm/retention");
  return { success: "Restored the default template text." };
}

export async function sendRetentionTemplateTestEmailAction(templateId: string, toEmail: string): Promise<RetentionActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: template, error: templateError } = await supabase.from("crm_retention_templates").select("campaign_type, subject, body").eq("id", templateId).maybeSingle();
  if (templateError || !template) return { error: "This template could not be found." };

  const result = await sendCrmRetentionTestEmail(template, toEmail);
  if (result.error) return { error: `Failed to send the test email: ${result.error}` };
  return { success: `Test email sent to ${toEmail}. Subject is prefixed with "[TEST]" — no client's campaign was affected.` };
}

// Admin-authenticated manual trigger for the exact same daily retention
// jobs /api/cron/crm-retention runs on schedule - same rationale as
// crm-marketing's runMarketingJobNowAction: lets an admin verify a
// newly-enrolled test client without touching CRON_SECRET. Duplicate
// safety is unaffected, since every claim still goes through
// claim_due_crm_retention_enrollments/claim_due_crm_retention_followups's
// atomic `FOR UPDATE SKIP LOCKED`.
export async function runRetentionJobNowAction(dryRun: boolean): Promise<RunJobActionResult> {
  await requireCrmAdmin();
  try {
    const [cadence, followups] = await Promise.all([runCrmRetentionCadenceJob({ dryRun }), runCrmRetentionFollowupsJob({ dryRun })]);
    if (!dryRun) revalidatePath("/admin/crm/retention");
    const verb = dryRun ? "Preview" : "Run";
    return {
      success: `${verb} complete — ${cadence.candidates + followups.candidates} due, ${cadence.sent + followups.sent} sent, ${cadence.failed + followups.failed} failed, ${cadence.skipped + followups.skipped} skipped.`,
      cadence,
      followups,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to run the retention job." };
  }
}
