import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { isEmailSuppressed, createUnsubscribeToken } from "./crm-email-suppression";
import { buildProspectEmailHtml, buildProspectEmailText } from "./prospect-email-templates";
import { getSiteUrl } from "./site-url";
import { createWinsalotPrefillToken } from "./winsalot-consultation-tokens";
import type { CrmUserRow } from "./crm-types";

export type SendProspectEmailInput = {
  opportunityId: string;
  crmUser: CrmUserRow;
  subject: string;
  message: string;
  ctaText: string;
};

export type SendProspectEmailResult = { error?: string; email?: string };

// Shared by the admin and agent "Send Email" actions - the templated
// consultation-invite email, editable by the sender in ProspectEmailModal
// before this runs. Callers must already have run
// requireCrmAdmin()/requireCrmUser() and pass the *session-scoped*
// Supabase client, so an agent can never reach another agent's prospect
// (crm_opportunities_agent_select_own / _update_own RLS) - the select
// below simply returns nothing for a prospect outside that agent's scope,
// which this reports as "not found" rather than leaking that it exists.
export async function sendProspectEmail(
  supabase: SupabaseClient,
  input: SendProspectEmailInput
): Promise<SendProspectEmailResult> {
  const { data: opportunity, error: fetchError } = await supabase
    .from("crm_opportunities")
    .select("email, contact_name, business_name, stage")
    .eq("id", input.opportunityId)
    .maybeSingle();

  if (fetchError || !opportunity) {
    return { error: "Prospect not found." };
  }
  if (!opportunity.email) {
    return { error: "This prospect has no email address on file — add one before sending." };
  }

  const toEmail = opportunity.email.trim();

  if (await isEmailSuppressed(toEmail)) {
    return { error: "This prospect has unsubscribed from promotional emails and cannot be emailed." };
  }

  const baseBookingUrl = process.env.WINSALOT_BOOKING_URL;
  if (!baseBookingUrl) {
    return { error: "WINSALOT_BOOKING_URL is not configured. Set it in the environment before sending consultation emails." };
  }

  // Every send mints its own fresh, single-purpose prefill token (see
  // src/lib/winsalot-consultation-tokens.ts) rather than linking to
  // WINSALOT_BOOKING_URL bare - this is what lets the public booking page
  // safely prefill this exact prospect's own contact/business/service
  // info without exposing their crm_opportunities.id or allowing the
  // link to be used to browse any other prospect's record.
  const prefillToken = await createWinsalotPrefillToken(input.opportunityId);
  const bookingUrl = `${baseBookingUrl}${baseBookingUrl.includes("?") ? "&" : "?"}t=${prefillToken}`;

  const subject = input.subject.trim();
  const message = input.message.trim();
  const ctaText = input.ctaText.trim();
  if (!subject || !message || !ctaText) {
    return { error: "Subject and message are required." };
  }

  const unsubscribeToken = await createUnsubscribeToken(toEmail, input.opportunityId);
  const unsubscribeUrl = `${getSiteUrl()}/unsubscribe/${unsubscribeToken}`;

  const fromEmail = process.env.EMAIL_FROM || "Winsalot Corp <info@winsalotcorp.com>";
  const replyToEmail = process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";

  const resend = getResendClient();
  const { data: sendResult, error: emailError } = await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    replyTo: replyToEmail,
    subject,
    text: buildProspectEmailText({ message, ctaText, bookingUrl, unsubscribeUrl }),
    html: buildProspectEmailHtml({ message, ctaText, bookingUrl, unsubscribeUrl }),
  });

  if (emailError || !sendResult) {
    return { error: `Failed to send the email: ${emailError?.message ?? "Unknown Resend error."}` };
  }

  const senderName = input.crmUser.full_name || input.crmUser.email;
  const sentAt = new Date().toISOString();

  const { data: activity, error: activityError } = await supabase
    .from("crm_activities")
    .insert({
      opportunity_id: input.opportunityId,
      agent_id: input.crmUser.id,
      activity_type: "email",
      notes: `Consultation invitation email sent to ${toEmail} by ${senderName} — "${subject}".`,
    })
    .select("id")
    .single();

  if (activityError) {
    return { error: "The email was sent, but recording it in the activity history failed." };
  }

  // crm_lead_emails has no RLS policies of its own (service-role only) -
  // same as sendTrackedCrmEmail's existing follow-up-email path.
  const admin = getSupabaseAdmin();
  const { error: trackingError } = await admin.from("crm_lead_emails").insert({
    opportunity_id: input.opportunityId,
    agent_id: input.crmUser.id,
    activity_id: activity?.id ?? null,
    resend_email_id: sendResult.id,
    email_type: "consultation_invite",
    to_email: toEmail,
    subject,
    status: "sent",
    status_at: sentAt,
    sent_at: sentAt,
  });

  if (trackingError) {
    return { error: "The email was sent, but delivery tracking could not be recorded." };
  }

  // "Change a New Prospect to Contacted. Do not overwrite a more advanced
  // status." - only ever touches stage when it's still exactly "New
  // Prospect"; every other stage (including one changed concurrently by
  // someone else since the page loaded) is left alone.
  const updates: Record<string, unknown> = {
    last_email_status: "sent",
    last_email_status_at: sentAt,
    last_email_type: "consultation_invite",
    last_email_to: toEmail,
  };
  if (opportunity.stage === "New Prospect") {
    updates.stage = "Contacted";
  }

  const { error: updateError } = await supabase.from("crm_opportunities").update(updates).eq("id", input.opportunityId);
  if (updateError) {
    return { error: "The email was sent, but updating the prospect's status failed." };
  }

  return { email: toEmail };
}
