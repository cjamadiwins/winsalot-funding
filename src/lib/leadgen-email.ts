import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { escapeHtml } from "./html";
import { LEADGEN_BOOKING_BUTTON_LABEL } from "./leadgen-types";

// Sender/reply-to for every email this CRM sends. Defaults to
// info@winsalotcorp.com - the sender already verified and in production
// use everywhere else in this app (see src/lib/send-crm-email.ts and
// friends). The brief's preferred sender, leads@winsalotcorp.com, can be
// switched on by setting LEADGEN_EMAIL_FROM once that address is
// confirmed verified in the Resend dashboard - never hardcoded here,
// since sending from an unverified address would silently fail or land
// in spam.
export function getLeadgenSenderEmail(): string {
  return process.env.LEADGEN_EMAIL_FROM || "Winsalot Corp <info@winsalotcorp.com>";
}

export function getLeadgenReplyToEmail(): string {
  return process.env.LEADGEN_EMAIL_REPLY_TO || "info@winsalotcorp.com";
}

// Exported so the consultation-invitation/follow-up send actions can
// build a custom HTML body that swaps the plain-text booking marker for
// a real, styled <a> button (see leadgenButtonHtml below) while still
// rendering everything else exactly like every other leadgen email.
export function textToSimpleHtml(text: string): string {
  const escaped = escapeHtml(text);
  return `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${escaped}</div>`;
}

// A real, styled HTML button (not just a plain link) for the
// consultation booking link - renders as a clickable button in every
// major desktop and mobile email client, with the raw URL underneath as
// a plain-text fallback for clients that strip inline styles.
export function leadgenButtonHtml(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<div style="margin: 20px 0; font-family: sans-serif;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#059669;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:9999px;">${safeLabel}</a>
  <div style="margin-top:10px;font-size:12px;color:#64748b;">Or copy and paste this link into your browser: <a href="${safeUrl}" style="color:#0284c7;">${safeUrl}</a></div>
</div>`;
}

// Builds the HTML body for the consultation invitation/follow-up emails:
// everything renders exactly like a normal leadgen email EXCEPT the
// literal "[BOOK YOUR FREE 15-MINUTE CONSULTATION]\n\n<url>" marker
// (produced by leadgenBookingInviteSection() in lib/leadgen-types.ts),
// which is swapped for a real HTML button. If bookingUrl is missing or
// the marker isn't found in `body` (e.g. an agent edited it out in the
// Send Follow-Up Email editor), this degrades gracefully to the normal
// plain-HTML rendering - never an error.
export function buildLeadgenBookingEmailHtml(body: string, bookingUrl: string | null | undefined): string {
  if (!bookingUrl) return textToSimpleHtml(body);

  const marker = `[${LEADGEN_BOOKING_BUTTON_LABEL}]\n\n${bookingUrl}`;
  const markerIndex = body.indexOf(marker);
  if (markerIndex === -1) return textToSimpleHtml(body);

  const before = body.slice(0, markerIndex);
  const after = body.slice(markerIndex + marker.length);
  return textToSimpleHtml(before) + leadgenButtonHtml(bookingUrl, LEADGEN_BOOKING_BUTTON_LABEL) + textToSimpleHtml(after);
}

export type SendLeadgenEmailInput = {
  clientId: string | null;
  campaignId?: string | null;
  leadId?: string | null;
  appointmentId?: string | null;
  templateKey?: string | null;
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
  // Custom HTML for the email body (e.g. a real button rendered in place
  // of a plain-text marker - see leadgenButtonHtml). Falls back to
  // textToSimpleHtml(body) when omitted, unchanged from before this
  // field existed.
  html?: string;
  // null for a system-generated send with no human sender (e.g. the
  // public consultation booking page's confirmation/admin-notification
  // emails, which have no signed-in leadgen_users account behind them).
  sentBy: string | null;
  // Whether the client login may see this in their Communications view.
  // Always true for a client-facing send; a prospect email (e.g. the
  // consultation email) defaults to false unless the caller explicitly
  // surfaces it - see the callers in leadgen actions files for the
  // per-email-type decision.
  clientVisible: boolean;
};

export type SendLeadgenEmailResult = { emailId: string; error?: string };

// Shared by every email this CRM sends (client communications and
// prospect/consultation emails alike) so sending, delivery tracking, and
// the audit trail stay identical no matter which one it is or who sends
// it. Callers must already have run requireLeadgenAdmin()/
// requireLeadgenAgent() themselves and validated the recipient - this
// relies on the session-scoped Supabase client (RLS) passed in to keep
// an agent scoped to their own leads, exactly like the cleaning CRM's
// sendTrackedCrmEmail.
//
// Writes a 'sending' row before calling Resend at all, so a request that
// fails outright (network error, thrown exception) still leaves a
// visible 'failed' record rather than nothing - satisfying the brief's
// "implement the database structure and sent/failed status now" even
// where a transient failure occurs.
export async function sendLeadgenEmail(
  supabase: SupabaseClient,
  input: SendLeadgenEmailInput
): Promise<SendLeadgenEmailResult> {
  const senderEmail = getLeadgenSenderEmail();

  // Brief: "Prevent agents from repeatedly emailing a permanently
  // bounced address unless an admin corrects or approves the email
  // address." Checked here (shared by every caller) rather than left to
  // the RLS policy alone, so a blocked send fails with a clear message
  // instead of a generic "row-level security" error - the RLS policy on
  // leadgen_emails (agent insert) still independently enforces the same
  // rule as a backstop.
  const { data: bounced } = await supabase
    .from("leadgen_bounced_emails")
    .select("cleared_at")
    .eq("email", input.toEmail.trim().toLowerCase())
    .maybeSingle();
  if (bounced && !bounced.cleared_at) {
    return { emailId: "", error: "This email address has permanently bounced. An admin must correct or approve it before sending again." };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("leadgen_emails")
    .insert({
      client_id: input.clientId,
      campaign_id: input.campaignId ?? null,
      lead_id: input.leadId ?? null,
      appointment_id: input.appointmentId ?? null,
      template_key: input.templateKey ?? null,
      to_email: input.toEmail,
      to_name: input.toName ?? null,
      subject: input.subject,
      body: input.body,
      sender_email: senderEmail,
      sent_by: input.sentBy,
      status: "sending",
      client_visible: input.clientVisible,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { emailId: "", error: "Failed to save the email record." };
  }

  const emailId = inserted.id as string;

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: senderEmail,
      to: input.toEmail,
      replyTo: getLeadgenReplyToEmail(),
      subject: input.subject,
      text: input.body,
      html: input.html ?? textToSimpleHtml(input.body),
    });

    if (sendError || !sendResult) {
      await supabase
        .from("leadgen_emails")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: sendError?.message ?? "Unknown Resend error.",
        })
        .eq("id", emailId);
      return { emailId, error: sendError?.message ?? "Failed to send the email." };
    }

    await supabase
      .from("leadgen_emails")
      .update({ status: "sent", resend_message_id: sendResult.id, sent_at: new Date().toISOString() })
      .eq("id", emailId);

    return { emailId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send the email.";
    await supabase
      .from("leadgen_emails")
      .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: message })
      .eq("id", emailId);
    return { emailId, error: message };
  }
}
