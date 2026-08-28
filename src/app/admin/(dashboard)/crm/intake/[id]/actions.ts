"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import { DEFAULT_INTAKE_QUESTIONS, type CrmIntakeQuestion, type CrmClientAgreementRow } from "@/lib/crm-agreement-types";
import { createIntakeToken } from "@/lib/crm-agreement-tokens";
import { sendIntakeFormEmail, sendIntakeSubmittedAdminNotificationEmail, getGrowthCrmNotificationEmail } from "@/lib/crm-agreement-emails";
import { notifyAdminsOfIntakeNotificationFailure } from "@/lib/crm-agreement-notifications";

type ActionResult = { error?: string };

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

// Item 6: "After the agreement is signed, create a secure, client-specific
// Growth CRM intake form." Creates the config once per agreement (never
// duplicated - a second call for the same agreement just returns the
// existing row) with the default question set (item 8), which the admin
// can then customize before sending. Editing this row can never affect
// another client's intake form or the main template - there is no shared
// template row for the questions array (see migration 0097).
export async function getOrCreateIntakeConfigAction(agreementId: string): Promise<ActionResult & { configId?: string }> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("crm_intake_configs").select("id").eq("agreement_id", agreementId).maybeSingle();
  if (existing) return { configId: existing.id as string };

  const { data: agreement } = await supabase
    .from("crm_client_agreements")
    .select("id, status, client_id, opportunity_id")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.status !== "signed") return { error: "The agreement must be signed before creating an intake form." };

  const { data: created, error } = await supabase
    .from("crm_intake_configs")
    .insert({
      client_id: agreement.client_id,
      agreement_id: agreementId,
      opportunity_id: agreement.opportunity_id,
      questions: DEFAULT_INTAKE_QUESTIONS,
    })
    .select("id")
    .single();

  if (error || !created) return { error: "Failed to create the intake form." };
  return { configId: created.id as string };
}

// Save as Draft / Edit Questions / Add Question / Remove Question /
// Reorder Questions (item 8) all collapse into one save of the full
// ordered array - the admin's editor keeps the array in local state and
// this persists it in one call once they're done, rather than one round
// trip per micro-edit.
export async function saveIntakeQuestionsAction(configId: string, questions: CrmIntakeQuestion[]): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: config } = await supabase.from("crm_intake_configs").select("status").eq("id", configId).maybeSingle();
  if (!config) return { error: "Intake form not found." };

  const { error } = await supabase.from("crm_intake_configs").update({ questions, updated_by: admin.id }).eq("id", configId);
  if (error) return { error: "Failed to save the intake form." };

  revalidatePath(`/admin/crm/intake/${configId}`);
  return {};
}

// Send Intake Form (item 8) - only ever fires once per config while it's
// still 'draft', which is what makes the *initial* send impossible to
// duplicate; a second send attempt from this same action would find
// status='sent' and refuse, per item 9's "prevent duplicate intake
// emails unless the admin confirms a resend" - a resend is the separate,
// explicitly-confirmed action below.
export async function sendIntakeFormAction(configId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: config } = await supabase.from("crm_intake_configs").select("*").eq("id", configId).maybeSingle();
  if (!config) return { error: "Intake form not found." };
  if (config.status !== "draft") return { error: "This intake form has already been sent." };

  const { data: agreement } = await supabase.from("crm_client_agreements").select("*").eq("id", config.agreement_id).maybeSingle();
  if (!agreement) return { error: "The linked agreement could not be found." };

  const token = await createIntakeToken(configId);
  const emailResult = await sendIntakeFormEmail(agreement as CrmClientAgreementRow, token);
  if (emailResult.error) return { error: `Failed to send: ${emailResult.error}` };

  const { error } = await supabase.from("crm_intake_configs").update({ status: "sent", sent_at: new Date().toISOString(), updated_by: admin.id }).eq("id", configId);
  if (error) return { error: "Email sent, but the status update failed." };

  await supabase.from("crm_activities").insert({
    client_id: config.client_id,
    opportunity_id: config.opportunity_id,
    agent_id: admin.id,
    activity_type: "intake_sent",
    notes: `Intake form sent to ${agreement.business_email} by ${performedByName(admin)}.`,
  });

  revalidatePath(`/admin/crm/intake/${configId}`);
  revalidatePath("/admin/crm/onboarding");
  return {};
}

// Resend Intake Link/Form - the UI gates this behind a confirm() dialog
// (item 11: "Require confirmation before... duplicate-send actions"),
// only reachable once the form has already been sent.
export async function resendIntakeFormAction(configId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: config } = await supabase.from("crm_intake_configs").select("*").eq("id", configId).maybeSingle();
  if (!config) return { error: "Intake form not found." };
  if (config.status !== "sent") return { error: "This intake form has not been sent yet." };

  const { data: agreement } = await supabase.from("crm_client_agreements").select("*").eq("id", config.agreement_id).maybeSingle();
  if (!agreement) return { error: "The linked agreement could not be found." };

  const token = await createIntakeToken(configId);
  const emailResult = await sendIntakeFormEmail(agreement as CrmClientAgreementRow, token);
  if (emailResult.error) return { error: `Failed to resend: ${emailResult.error}` };

  return {};
}

// Item 3's "Retry" button: re-attempts sending the admin's own "intake
// submitted" notification email for a submission whose previous attempt
// failed. Never re-fires the in-app "submitted" notification itself -
// only the email, and only the failure notification if it fails again.
export async function retryIntakeAdminNotificationEmailAction(submissionId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: submission } = await supabase.from("crm_intake_submissions").select("id, intake_config_id, client_id").eq("id", submissionId).maybeSingle();
  if (!submission) return { error: "Submission not found." };

  const { data: client } = await supabase.from("crm_clients").select("company_name").eq("id", submission.client_id).maybeSingle();
  const businessName = client?.company_name ?? "A client";

  const adminNotificationEmail = getGrowthCrmNotificationEmail();
  const emailResult = await sendIntakeSubmittedAdminNotificationEmail({ businessName, intakeConfigId: submission.intake_config_id }, adminNotificationEmail);

  if (emailResult.error) {
    await supabase
      .from("crm_intake_submissions")
      .update({ admin_notification_failed_at: new Date().toISOString(), admin_notification_error: emailResult.error })
      .eq("id", submissionId);
    await notifyAdminsOfIntakeNotificationFailure({ intakeConfigId: submission.intake_config_id, businessName, reason: emailResult.error });
    return { error: `Retry failed: ${emailResult.error}` };
  }

  await supabase
    .from("crm_intake_submissions")
    .update({ admin_notified_at: new Date().toISOString(), admin_notification_failed_at: null, admin_notification_error: null })
    .eq("id", submissionId);

  revalidatePath(`/admin/crm/intake/${submission.intake_config_id}`);
  return {};
}

// Item 9: "Allow admin corrections with an audit history. Record who
// changed information and when." The client's original `answers` are
// never touched - corrections live in a second `corrected_answers` layer
// plus one audit row per field change.
export async function correctIntakeSubmissionFieldAction(submissionId: string, fieldKey: string, newValue: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: submission } = await supabase.from("crm_intake_submissions").select("answers, corrected_answers").eq("id", submissionId).maybeSingle();
  if (!submission) return { error: "Submission not found." };

  const currentAnswers = (submission.corrected_answers ?? submission.answers ?? {}) as Record<string, string>;
  const oldValue = currentAnswers[fieldKey] ?? null;
  const nextCorrected = { ...currentAnswers, [fieldKey]: newValue };

  const { error: updateError } = await supabase.from("crm_intake_submissions").update({ corrected_answers: nextCorrected }).eq("id", submissionId);
  if (updateError) return { error: "Failed to save the correction." };

  const admin_ = getSupabaseAdmin();
  await admin_.from("crm_intake_submission_edits").insert({
    submission_id: submissionId,
    changed_by: admin.id,
    field_key: fieldKey,
    old_value: oldValue,
    new_value: newValue,
  });

  return {};
}
