import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { escapeHtml } from "./html";
import type { CrmUserRow } from "./crm-types";

export type ProviderEmailTarget = { providerLeadId: string } | { cleaningProviderId: string };

// Provider Profile's generic "Send Email" quick action - a free-form
// subject/message to either a Provider Acquisition lead (pre-approval) or
// an operational provider (cleaning_providers), distinct from the
// templated 'provider_intake' email (src/lib/send-provider-intake-email.ts),
// which is unchanged. Uses the same crm_lead_emails tracking table, keyed
// by whichever target this call is for.
export async function sendProviderMessageEmail(
  supabase: SupabaseClient,
  target: ProviderEmailTarget,
  crmUser: CrmUserRow,
  subject: string,
  message: string
): Promise<{ email: string }> {
  const table = "providerLeadId" in target ? "provider_leads" : "cleaning_providers";
  const nameField = "providerLeadId" in target ? "business_name" : "company_name";
  const id = "providerLeadId" in target ? target.providerLeadId : target.cleaningProviderId;

  const { data: provider, error: fetchError } = await supabase
    .from(table)
    .select(`email, contact_person, ${nameField}`)
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !provider) {
    throw new Error("Provider not found.");
  }
  if (!provider.email) {
    throw new Error("This provider has no email address on file.");
  }

  const fromEmail = process.env.EMAIL_FROM || "Winsalot Corp <info@winsalotcorp.com>";
  const replyToEmail = process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";
  const name = provider.contact_person || (provider as Record<string, unknown>)[nameField];

  const resend = getResendClient();
  const { data: sendResult, error: emailError } = await resend.emails.send({
    from: fromEmail,
    to: provider.email,
    replyTo: replyToEmail,
    subject,
    text: `Hi ${name},\n\n${message}\n\nThank you,\nWinsalot Corp`,
    html: `<p>Hi ${escapeHtml(String(name))},</p><p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p><p>Thank you,<br/>Winsalot Corp</p>`,
  });

  if (emailError || !sendResult) {
    throw new Error(`Failed to send the email: ${emailError?.message ?? "Unknown Resend error."}`);
  }

  const senderName = crmUser.full_name || crmUser.email;
  const sentAt = new Date().toISOString();
  const targetColumn = "providerLeadId" in target ? "provider_lead_id" : "cleaning_provider_id";

  const { data: activity, error: activityError } = await supabase
    .from("crm_activities")
    .insert({
      [targetColumn]: id,
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
    [targetColumn]: id,
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
    .from(table)
    .update({
      last_email_status: "sent",
      last_email_status_at: sentAt,
      last_email_type: "provider_message",
      last_email_to: provider.email,
      last_contacted_at: sentAt,
    })
    .eq("id", id);

  if (providerUpdateError) {
    throw new Error("The email was sent, but updating the provider's email status failed.");
  }

  return { email: provider.email };
}
