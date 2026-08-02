import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { escapeHtml } from "./html";
import { getSupabaseAdmin } from "./supabase-admin";
import { LEADGEN_BRENTS_ESSENTIALS_FALLBACK } from "./leadgen-types";

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

function stripHtmlTags(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n");
}

function sanitizePlainEmailBody(body: string): string {
  return stripHtmlTags(body).replace(/\n{3,}/g, "\n\n").trim();
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

// The consultation booking button - matches the primary CTA button style
// used in the cleaning-quote emails (see quote-request-email.ts /
// customer-quote-email.ts: blue #2563eb, 6px rounded corners, bold white
// text) per an explicit "make it look like the cleaning quote email
// button" request. Unlike leadgenButtonHtml (the green services
// button), the fallback line never shows the raw URL - only clickable
// text ("click here to book your consultation"), per an explicit
// "do not show the full Calendly URL" instruction.
export function leadgenBookingButtonHtml(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<div style="margin: 20px 0; font-family: sans-serif; text-align:center;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;padding:16px 40px;border-radius:6px;">${safeLabel}</a>
  <div style="margin-top:10px;font-size:13px;color:#6b7280;">If the button does not work, open this booking link:</div>
  <div style="margin-top:4px;font-size:13px;"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${safeUrl}</a></div>
</div>`;
}

// Builds the HTML body for the consultation invitation/follow-up emails:
// everything renders exactly like a normal leadgen email EXCEPT each
// literal "[BUTTON LABEL]\n\n<url>" marker (produced by
// leadgenBookingInviteSection()/leadgenServicesInviteSection() in
// lib/leadgen-types.ts), which is swapped for a real HTML button - the
// green services-button style (leadgenButtonHtml, default) or, when
// style: "booking" is set on that entry, the blue booking-button style
// with no visible raw URL (leadgenBookingButtonHtml). Any marker that's
// missing (no URL configured) or was edited out of `body` (e.g. in the
// Send Follow-Up Email editor) is simply skipped - this never errors, it
// degrades to plain-HTML rendering around whatever markers *are* still
// present.
export function buildLeadgenBookingEmailHtml(
  body: string,
  buttons: { url: string | null | undefined; label: string; style?: "button" | "booking" }[]
): string {
  const sanitizedBody = sanitizePlainEmailBody(body);
  const usableButtons = buttons.filter((b): b is { url: string; label: string; style?: "button" | "booking" } => !!b.url);
  const withMarkers = usableButtons.map((b) => ({ ...b, marker: `[${b.label}]\n\n${b.url}` }));

  const found = withMarkers
    .map((b) => ({ ...b, index: sanitizedBody.indexOf(b.marker) }))
    .filter((b) => b.index !== -1)
    .sort((a, b) => a.index - b.index);
  // A usable button whose marker text isn't literally present in the body
  // (e.g. the template placeholder that was supposed to produce it was
  // edited to something this function doesn't render, or removed) must
  // still show up somewhere rather than silently vanish - appended after
  // the found ones, in the order given, same as when none are found.
  const foundMarkers = new Set(found.map((b) => b.marker));
  const notFound = withMarkers.filter((b) => !foundMarkers.has(b.marker));

  let html = "";
  let cursor = 0;
  for (const button of found) {
    html += textToSimpleHtml(sanitizedBody.slice(cursor, button.index));
    html += button.style === "booking" ? leadgenBookingButtonHtml(button.url, button.label) : leadgenButtonHtml(button.url, button.label);
    cursor = button.index + button.marker.length;
  }
  html += textToSimpleHtml(sanitizedBody.slice(cursor));
  for (const button of notFound) {
    html += button.style === "booking" ? leadgenBookingButtonHtml(button.url, button.label) : leadgenButtonHtml(button.url, button.label);
  }
  return html;
}

// Consultation Information emails come from editable plain-text templates
// that historically included a visible Calendly URL line. This helper
// renders that link as a centered blue CTA button, in the order: message,
// then button, then one signature. Whatever wording followed the URL in
// the template (e.g. "We look forward to speaking with you... Regards,
// ...") duplicated the closing this function already appends below, so
// it's dropped along with the URL rather than kept as a second closing
// ahead of the button.
//
// bookingUrl is required (never falls back to the Brent's Essentials
// website) - the caller must block sending entirely when the client has
// no Consultation Booking Link configured, rather than pass one in here.
// The Brent's Essentials website only ever appears in the signature's
// separate "Website:" line below, never as the booking button's target.
export function buildLeadgenConsultationCtaEmail(
  body: string,
  bookingUrl: string,
  buttonLabel: string
): { text: string; html?: string } {
  const sanitizedBody = sanitizePlainEmailBody(body);
  const websiteUrl = LEADGEN_BRENTS_ESSENTIALS_FALLBACK.servicesUrl;
  const signatureText = `Best,\nBrent's Essentials Team\nBrent's Essentials\n${websiteUrl}`;

  const buildCtaHtml = () => {
    const safeUrl = escapeHtml(bookingUrl);
    return `<div style="margin:20px 0 14px 0;font-family:sans-serif;text-align:center;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:17px;font-weight:700;line-height:1.3;text-decoration:none;padding:16px 24px;border-radius:6px;">
    ${escapeHtml(buttonLabel)}
  </a>
  <div style="margin-top:10px;font-size:13px;color:#475569;">If the button does not work, open this link:</div>
  <div style="margin-top:4px;font-size:13px;line-height:1.5;"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${safeUrl}</a></div>
</div>`;
  };

  const buildSignatureHtml = () => {
    const safeUrl = escapeHtml(websiteUrl);
    return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b;margin-top:12px;white-space:pre-wrap;">Best,<br>Brent's Essentials Team<br>Brent's Essentials<br>Website: <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#0284c7;">${safeUrl}</a></div>`;
  };

  const escapedBase = bookingUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const canonicalRegex = new RegExp(`${escapedBase}(?:\\?[^\\s\\n]*)?`, "gi");
  const calendlyRegex = /https?:\/\/calendly\.com\/[^\s\n]+/gi;

  const hasCanonical = canonicalRegex.test(sanitizedBody);
  canonicalRegex.lastIndex = 0;
  const pattern = hasCanonical ? canonicalRegex : calendlyRegex;

  // The message is everything up to the booking URL - nothing renders
  // after the button except the one signature built above.
  pattern.lastIndex = 0;
  const match = pattern.exec(sanitizedBody);
  const messageCore = (match ? sanitizedBody.slice(0, match.index) : sanitizedBody).replace(/\n{3,}/g, "\n\n").trim();

  const text = `${messageCore}\n\n${buttonLabel}\n${bookingUrl}\n\n${signatureText}`;
  const html = `${textToSimpleHtml(messageCore)}${buildCtaHtml()}${buildSignatureHtml()}`;
  return { text, html };
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
  // Optional explicit plain-text body to send via Resend's `text`
  // field when `body` contains HTML markup intended only for `html`.
  text?: string;
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
  const finalText = sanitizePlainEmailBody(input.text ?? input.body);
  const finalHtml = input.html ?? textToSimpleHtml(input.body);

  // Do not save/send consultation information emails unless the fully
  // generated HTML includes the required CTA, a real booking link, and
  // signature section. Checks for *a* link rather than one hardcoded URL
  // so this still passes once an admin points the booking button at
  // their own link (see resolveLeadgenEmailBranding in lib/leadgen-types.ts) -
  // pinning this to the Brent's Essentials fallback URL would block
  // sending as soon as that admin-configured link differed from it.
  if (input.templateKey === "consultation_information") {
    const hasButtonLabel = finalHtml.includes("Book Your Free 15-Minute Consultation");
    const hasBookingLink = /href="https?:\/\/[^"]+"/.test(finalHtml);
    const hasSignature = finalHtml.includes("Brent's Essentials Team") && finalHtml.includes("Best,");
    if (!hasButtonLabel || !hasBookingLink || !hasSignature) {
      return { emailId: "", error: "Consultation email HTML is incomplete. Please regenerate and try again." };
    }
  }

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
  const admin = getSupabaseAdmin();

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: senderEmail,
      to: input.toEmail,
      replyTo: getLeadgenReplyToEmail(),
      subject: input.subject,
      text: finalText,
      html: finalHtml,
    });

    if (sendError || !sendResult) {
      const safeReason = sendError?.message ?? "Unknown Resend error.";
      await admin
        .from("leadgen_emails")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: safeReason,
        })
        .eq("id", emailId);
      return { emailId, error: "Failed to send the email. Please try again." };
    }

    const { error: sentStatusError } = await admin
      .from("leadgen_emails")
      .update({ status: "sent", resend_message_id: sendResult.id, sent_at: new Date().toISOString() })
      .eq("id", emailId);
    if (sentStatusError) {
      await admin
        .from("leadgen_emails")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: "Status update failed after Resend accepted the email.",
          resend_message_id: sendResult.id,
        })
        .eq("id", emailId);
      return { emailId, error: "Email was accepted by Resend but status tracking failed." };
    }

    return { emailId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send the email.";
    await admin
      .from("leadgen_emails")
      .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: message })
      .eq("id", emailId);
    return { emailId, error: "Failed to send the email. Please try again." };
  }
}
