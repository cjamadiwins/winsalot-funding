import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { escapeHtml } from "./html";
import { recalculateProviderScoreSafely } from "./provider-score";
import type { CrmUserRow } from "./crm-types";

// Provider Profile's generic "Send Email" quick action - a free-form
// subject/message to the provider, distinct from the templated
// 'provider_intake' email (src/lib/send-provider-intake-email.ts), which
// is unchanged. Uses the same crm_lead_emails tracking table via
// provider_lead_id and the same 'sent' activity-logging pattern.
export async function sendProviderMessageEmail(
  supabase: SupabaseClient,
  providerLeadId: string,
  crmUser: CrmUserRow,
  subject: string,
  message: string
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
    throw new Error("This provider has no email address on file.");
  }

  const fromEmail = process.env.EMAIL_FROM || "Winsalot Corp <info@winsalotcorp.com>";
  const replyToEmail = process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";
  const name = provider.contact_person || provider.business_name;

  const resend = getResendClient();
  const { data: sendResult, error: emailError } = await resend.emails.send({
    from: fromEmail,
    to: provider.email,
    replyTo: replyToEmail,
    subject,
    text: `Hi ${name},\n\n${message}\n\nThank you,\nWinsalot Corp`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p><p>Thank you,<br/>Winsalot Corp</p>`,
  });

  if (emailError || !sendResult) {
    throw new Error(`Failed to send the email: ${emailError?.message ?? "Unknown Resend error."}`);
  }

  const senderName = crmUser.full_name || crmUser.email;
  const sentAt = new Date().toISOString();

  const { data: activity, error: activityError } = await supabase
    .from("crm_activities")
    .insert({
      provider_lead_id: providerLeadId,
      agent_id: crmUser.id,
      activity_type: "email",
      notes: `"${subject}" sent to ${provider.email} by ${senderName}.`,
    })
    .select("id")
    .single();

  if (activityError) {
    throw new Error("The email was sent, but recording it in the activity history failed.");
  }

  const admin = getSupabaseAdmin();
  const { error: trackingError } = await admin.from("crm_lead_emails").insert({
    provider_lead_id: providerLeadId,
    agent_id: crmUser.id,
    activity_id: activity?.id ?? null,
    resend_email_id: sendResult.id,
    email_type: "provider_message",
    to_email: provider.email,
    subject,
    status: "sent",
    status_at: sentAt,
    sent_at: sentAt,
  });

  if (trackingError) {
    throw new Error("The email was sent, but delivery tracking could not be recorded.");
  }

  const { error: providerUpdateError } = await supabase
    .from("provider_leads")
    .update({
      last_email_status: "sent",
      last_email_status_at: sentAt,
      last_email_type: "provider_message",
      last_email_to: provider.email,
      last_contacted_at: sentAt,
    })
    .eq("id", providerLeadId);

  if (providerUpdateError) {
    throw new Error("The email was sent, but updating the provider's email status failed.");
  }

  recalculateProviderScoreSafely(providerLeadId, "Email sent to provider");
  return { email: provider.email };
}
