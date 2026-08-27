import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { escapeHtml } from "./html";
import { getSupabaseAdmin } from "./supabase-admin";
import { LEADGEN_CONSULTATION_CTA_LABEL } from "./leadgen-types";

// Sender/reply-to for every email this CRM sends. Defaults to
// info@winsalotcorp.com - the sender already verified and in production
// use everywhere else in this app (see src/lib/send-crm-email.ts and
// friends). The brief's preferred sender, leads@winsalotcorp.com, can be
// switched on by setting LEADGEN_EMAIL_FROM once that address is
// confirmed verified in the Resend dashboard - never hardcoded here,
// since sending from an unverified address would silently fail or land
// in spam. The display name is a recognizable person ("C.J. at Winsalot
// Corp") rather than a generic company name - matching the Growth CRM's
// own default (src/lib/email-senders.ts) - since Gmail is more likely to
// route mail from an apparent company/department name into Promotions.
export function getLeadgenSenderEmail(): string {
  return process.env.LEADGEN_EMAIL_FROM || "C.J. at Winsalot Corp <info@winsalotcorp.com>";
}

export function getLeadgenReplyToEmail(): string {
  return process.env.LEADGEN_EMAIL_REPLY_TO || "info@winsalotcorp.com";
}

// Swaps only the display-name portion of the sender ("Winsalot Corp" in
// "Winsalot Corp <info@winsalotcorp.com>") for an admin-configured one
// (brief ADMIN SETTINGS: "Sender name... using existing approved
// addresses") - the actual verified address itself is never
// admin-editable, only its display name, so this can never send from an
// unverified domain.
export function buildLeadgenSenderWithDisplayName(displayName: string): string {
  const baseSender = getLeadgenSenderEmail();
  const match = baseSender.match(/<([^>]+)>/);
  const verifiedAddress = match ? match[1] : baseSender;
  return `${displayName} <${verifiedAddress}>`;
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

// A plain inline text link (no colored button graphic, no background
// fill) for the consultation booking link - a large promotional-looking
// button is exactly the kind of visual cue that pushes an email into
// Gmail's Promotions tab, so every CTA in this CRM's outbound mail
// renders as ordinary link text a person would send from their own
// inbox instead. Kept as its own function (rather than folded into
// leadgenBookingButtonHtml) since callers still address them
// separately - see the style: "button"/"booking" distinction below.
export function leadgenButtonHtml(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<p style="margin: 16px 0; font-family: sans-serif; font-size:15px; line-height:1.6; color:#1e293b;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#1a56db;text-decoration:underline;">${safeLabel}</a>
</p>`;
}

// The consultation booking link - same plain-text-link treatment as
// leadgenButtonHtml above (previously a large blue button graphic,
// replaced per the deliverability brief's "no large promotional
// buttons" / "use a simple text link instead" requirement). The raw
// Calendly URL is still never shown as visible text - only this label,
// exactly like before.
export function leadgenBookingButtonHtml(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<p style="margin: 16px 0; font-family: sans-serif; font-size:15px; line-height:1.6; color:#1e293b;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#1a56db;text-decoration:underline;">${safeLabel}</a>
</p>`;
}

// Builds the HTML body for the consultation invitation/follow-up emails:
// everything renders exactly like a normal leadgen email EXCEPT each
// literal "[BUTTON LABEL]\n\n<url>" marker (produced by
// leadgenBookingInviteSection()/leadgenServicesInviteSection() in
// lib/leadgen-types.ts), which is swapped for a plain text link - the
// services-link marker (leadgenButtonHtml, default) or, when
// style: "booking" is set on that entry, the booking-link marker with
// no visible raw URL (leadgenBookingButtonHtml). Both render identically
// as ordinary link text, not a colored button graphic, per the
// deliverability brief. Any marker that's missing (no URL configured) or
// was edited out of `body` (e.g. in the Send Follow-Up Email editor) is
// simply skipped - this never errors, it degrades to plain-HTML
// rendering around whatever markers *are* still present.
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
//
// clientName/websiteUrl are the lead's *own* client's resolved branding
// (see resolveLeadgenEmailBranding in lib/leadgen-types.ts) - the caller
// is responsible for resolving these per-client, exactly like the
// sibling consultation-invitation/follow-up flows already do. Brent's
// Essentials is never hardcoded here; it only ever appears because a
// Brent's Essentials lead's own resolved clientName/websiteUrl happen to
// be "Brent's Essentials"/its website, same as any other client's would.
export function buildLeadgenConsultationCtaEmail(
  body: string,
  bookingUrl: string,
  buttonLabel: string,
  clientName: string,
  websiteUrl: string | null
): { text: string; html?: string } {
  const sanitizedBody = sanitizePlainEmailBody(body);
  // No services/website link configured for this client - drop the
  // "Website:" line entirely rather than show a broken/missing link
  // (same never-show-a-broken-link rule as leadgenBookingParagraph).
  const signatureText = websiteUrl ? `Best,\n${clientName} Team\n${clientName}\n${websiteUrl}` : `Best,\n${clientName} Team\n${clientName}`;

  // Plain inline text link, not a colored button graphic - per the
  // deliverability brief's "no large promotional buttons" requirement.
  const buildCtaHtml = () => {
    const safeUrl = escapeHtml(bookingUrl);
    return `<p style="margin:16px 0;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#1a56db;text-decoration:underline;">${escapeHtml(buttonLabel)}</a>
</p>`;
  };

  const buildSignatureHtml = () => {
    const websiteLine = websiteUrl
      ? `<br>Website: <a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0284c7;">${escapeHtml(websiteUrl)}</a>`
      : "";
    return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b;margin-top:12px;white-space:pre-wrap;">Best,<br>${escapeHtml(clientName)} Team<br>${escapeHtml(clientName)}${websiteLine}</div>`;
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
  // Admin-configured overrides (leadgen_appointment_reminder_settings,
  // brief ADMIN SETTINGS "Sender name and reply-to address, using
  // existing approved addresses") - used only by the automatic
  // appointment reminder job today. Omitted, every other caller keeps
  // exactly the env-configured sender/reply-to it always had.
  senderDisplayNameOverride?: string | null;
  replyToOverride?: string | null;
  // The lead's resolved client name (see resolveLeadgenEmailBranding),
  // used only to validate the "consultation_information" template's
  // required signature below against the *right* client - never
  // hardcoded to Brent's Essentials, so this validation (and therefore
  // the send) works correctly for any client, not just that one.
  expectedSignatureName?: string;
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
  const senderEmail = input.senderDisplayNameOverride ? buildLeadgenSenderWithDisplayName(input.senderDisplayNameOverride) : getLeadgenSenderEmail();
  const replyToEmail = input.replyToOverride || getLeadgenReplyToEmail();
  const finalText = sanitizePlainEmailBody(input.text ?? input.body);
  const finalHtml = input.html ?? textToSimpleHtml(input.body);

  // Do not save/send consultation information emails unless the fully
  // generated HTML includes the required CTA, a real booking link, and
  // signature section. Checks for *a* link rather than one hardcoded URL
  // so this still passes once an admin points the booking button at
  // their own link (see resolveLeadgenEmailBranding in lib/leadgen-types.ts) -
  // pinning this to the Brent's Essentials fallback URL would block
  // sending as soon as that admin-configured link differed from it.
  // Likewise, the signature check is against this lead's own resolved
  // client name (expectedSignatureName), never a hardcoded brand string
  // - Brent's Essentials in name only when the lead's own client
  // actually resolves to that.
  if (input.templateKey === "consultation_information") {
    const hasButtonLabel = finalHtml.includes(LEADGEN_CONSULTATION_CTA_LABEL);
    const hasBookingLink = /href="https?:\/\/[^"]+"/.test(finalHtml);
    // finalHtml is HTML - the signature-building code (buildLeadgenConsultationCtaEmail)
    // runs the client name through escapeHtml before writing it in, so an
    // apostrophe in e.g. "Brent's Essentials" becomes "&#39;" there. The
    // expected name must be escaped the same way before comparing, or this
    // check fails on every client name containing an HTML-special
    // character even though the actual rendered email is correct.
    const expectedSignatureName = escapeHtml(input.expectedSignatureName ?? "Brent's Essentials");
    const hasSignature = finalHtml.includes(`${expectedSignatureName} Team`) && finalHtml.includes("Best,");
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
      replyTo: replyToEmail,
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
