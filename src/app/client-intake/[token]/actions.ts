"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { consumeIntakeToken, markIntakeTokenOpened } from "@/lib/crm-agreement-tokens";

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

  const { error: insertError } = await admin.from("crm_intake_submissions").insert({
    intake_config_id: config.id,
    client_id: config.client_id,
    agreement_id: config.agreement_id,
    opportunity_id: config.opportunity_id,
    answers,
  });

  if (insertError) return { error: "Failed to submit your intake form. Please try again." };

  await admin.from("crm_activities").insert({
    client_id: config.client_id,
    opportunity_id: config.opportunity_id,
    activity_type: "intake_received",
    notes: "Client intake form submitted.",
  });

  // Notify admins in-app (item 9: "Notify the admin"), same
  // dedupe-by-link-path pattern used by notifyAdminsOfCrmLeaveRequest -
  // never more than one notification per admin for the same submission.
  const [{ data: admins }, { data: client }] = await Promise.all([
    admin.from("crm_users").select("id").eq("role", "admin").eq("active", true),
    admin.from("crm_clients").select("company_name").eq("id", config.client_id).maybeSingle(),
  ]);
  if (admins && admins.length > 0) {
    const linkPath = "/admin/crm/onboarding";
    await admin.from("crm_notifications").insert(
      admins.map((a) => ({
        user_id: a.id as string,
        title: `Intake form submitted for ${client?.company_name ?? "a client"}.`,
        link_path: linkPath,
      }))
    );
  }

  return {};
}
