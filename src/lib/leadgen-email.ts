import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";

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

function textToSimpleHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${escaped}</div>`;
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
  sentBy: string;
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
      html: textToSimpleHtml(input.body),
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
