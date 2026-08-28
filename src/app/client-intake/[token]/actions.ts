"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { consumeIntakeToken, markIntakeTokenOpened } from "@/lib/crm-agreement-tokens";
import { sendIntakeSubmittedAdminNotificationEmail, getGrowthCrmNotificationEmail } from "@/lib/crm-agreement-emails";
import { notifyAdminsOfIntakeSubmission, notifyAdminsOfIntakeNotificationFailure } from "@/lib/crm-agreement-notifications";

type ActionResult = { error?: string };

export async function recordIntakeOpenedAction(token: string): Promise<void> {
  await markIntakeTokenOpened(token);
}

// Item 9: "Connect the response to the correct Growth CRM client and
// signed agreement. Change the onboarding status to 'Intake Received.'
// Notify the admin. Preserve the client's original submission." The
// token is consumed atomically so the same link can never submit twice;
// `answers` is written once and never touched again by this action -
// only an admin correction (correctIntakeSubmissionFieldAction) can ever
// layer a change on top, in a separate column.
export async function submitClientIntakeAction(token: string, answers: Record<string, string>): Promise<ActionResult> {
  const consumed = await consumeIntakeToken(token);
  if (!consumed.ok) return { error: consumed.error };

  const admin = getSupabaseAdmin();
  const { data: config } = await admin.from("crm_intake_configs").select("*").eq("id", consumed.intakeConfigId).maybeSingle();
  if (!config) return { error: "Intake form not found." };

  const { data: existing } = await admin.from("crm_intake_submissions").select("id").eq("intake_config_id", config.id).maybeSingle();
  if (existing) return { error: "This intake form has already been submitted." };

  const { data: submission, error: insertError } = await admin
    .from("crm_intake_submissions")
    .insert({
      intake_config_id: config.id,
      client_id: config.client_id,
      agreement_id: config.agreement_id,
      opportunity_id: config.opportunity_id,
      answers,
    })
    .select("id")
    .single();

  if (insertError || !submission) return { error: "Failed to submit your intake form. Please try again." };

  await admin.from("crm_activities").insert({
    client_id: config.client_id,
    opportunity_id: config.opportunity_id,
    activity_type: "intake_received",
    notes: "Client intake form submitted.",
  });

  const { data: client } = await admin.from("crm_clients").select("company_name").eq("id", config.client_id).maybeSingle();
  const businessName = client?.company_name ?? "A client";

  // Item 2: in-app admin notification always fires, independent of
  // whether the admin's own notification EMAIL below succeeds.
  await notifyAdminsOfIntakeSubmission({ intakeConfigId: config.id, businessName });

  const adminNotificationEmail = getGrowthCrmNotificationEmail();
  const emailResult = await sendIntakeSubmittedAdminNotificationEmail({ businessName, intakeConfigId: config.id }, adminNotificationEmail);
  if (emailResult.error) {
    await admin
      .from("crm_intake_submissions")
      .update({ admin_notification_failed_at: new Date().toISOString(), admin_notification_error: emailResult.error })
      .eq("id", submission.id);
    // Item 3: notify the admin (in-app) that their own notification
    // email failed, with the reason - the Retry button lives on the
    // intake detail page this links to.
    await notifyAdminsOfIntakeNotificationFailure({ intakeConfigId: config.id, businessName, reason: emailResult.error });
  } else {
    await admin.from("crm_intake_submissions").update({ admin_notified_at: new Date().toISOString() }).eq("id", submission.id);
  }

  return {};
}
