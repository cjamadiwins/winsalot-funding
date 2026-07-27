import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  PROVIDER_INTAKE_EMAIL_SUBJECT,
  buildProviderIntakeEmailHtml,
  buildProviderIntakeEmailText,
} from "./provider-intake-email";
import type { CrmUserRow } from "./crm-types";

// Provider Acquisition's equivalent of sendTrackedCrmEmail
// (src/lib/send-crm-email.ts) - deliberately a separate function rather
// than widening that one, since it targets provider_leads/provider_lead_id
// instead of crm_leads/lead_id (see migration 0026). Uses the same
// underlying crm_lead_emails tracking table and Resend webhook handler,
// just via provider_lead_id instead of lead_id.
//
// Callers must already have run requireCrmAdmin()/requireCrmUser()
// themselves - this relies on the session-scoped Supabase client (RLS) to
// keep an agent scoped to their own assigned provider leads.
export async function sendProviderIntakeEmail(
  supabase: SupabaseClient,
  providerLeadId: string,
  crmUser: CrmUserRow
): Promise<{ email: string }> {
  const { data: provider, error: fetchError } = await supabase
    .from("provider_leads")
    .select("email, contact_person, business_name")
    .eq("id", providerLeadId)
    .maybeSingle();

  if (fetchError || !provider) {
    throw new Error("Provider lead not found.");
  }
  if (!provider.email) {
    throw new Error("This provider has no email address on file — the intake form email can't be sent.");
  }

  const name = provider.contact_person || provider.business_name;
  const fromEmail =
    process.env.PROVIDER_INTAKE_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "Winsalot Corp <info@winsalotcorp.com>";
  const replyToEmail = process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";

  const resend = getResendClient();
  const { data: sendResult, error: emailError } = await resend.emails.send({
    from: fromEmail,
    to: provider.email,
    replyTo: replyToEmail,
    subject: PROVIDER_INTAKE_EMAIL_SUBJECT,
    text: buildProviderIntakeEmailText(name),
    html: buildProviderIntakeEmailHtml(name),
  });

  if (emailError || !sendResult) {
    throw new Error(`Failed to send the intake form email: ${emailError?.message ?? "Unknown Resend error."}`);
  }

  const senderName = crmUser.full_name || crmUser.email;
  const sentAt = new Date().toISOString();

  // "Add the activity to the provider activity log" (brief section 5) -
  // records who sent it and when, same as every other CRM email.
  const { data: activity, error: activityError } = await supabase
    .from("crm_activities")
    .insert({
      provider_lead_id: providerLeadId,
      agent_id: crmUser.id,
      activity_type: "email",
      notes: `Intake form email sent to ${provider.email} by ${senderName}.`,
    })
    .select("id")
    .single();

  if (activityError) {
    throw new Error("The email was sent, but recording it in the activity history failed.");
  }

  // crm_lead_emails has no RLS policies of its own (service-role only) -
  // same access pattern as sendTrackedCrmEmail.
  const admin = getSupabaseAdmin();
  const { error: trackingError } = await admin.from("crm_lead_emails").insert({
    provider_lead_id: providerLeadId,
    agent_id: crmUser.id,
    activity_id: activity?.id ?? null,
    resend_email_id: sendResult.id,
    email_type: "provider_intake",
    to_email: provider.email,
    subject: PROVIDER_INTAKE_EMAIL_SUBJECT,
    status: "sent",
    status_at: sentAt,
    sent_at: sentAt,
  });

  if (trackingError) {
    throw new Error("The email was sent, but delivery tracking could not be recorded.");
  }

  // "Change the provider status to 'Intake Form Sent'" + save the
  // date/time and the sending agent (brief section 5) - all in the same
  // update as the email-status mirror.
  const { error: providerUpdateError } = await supabase
    .from("provider_leads")
    .update({
      status: "Intake Form Sent",
      last_email_status: "sent",
      last_email_status_at: sentAt,
      last_email_type: "provider_intake",
      last_email_to: provider.email,
      last_contacted_at: sentAt,
    })
    .eq("id", providerLeadId);

  if (providerUpdateError) {
    throw new Error("The email was sent, but updating the provider's status failed.");
  }

  return { email: provider.email };
}
