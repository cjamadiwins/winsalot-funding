import { escapeHtml } from "./html";
import type { OpportunityType } from "./crm-types";

// The three consultation-invite templates (brief: "prospect-email
// system"), one per opportunity_type - selected automatically from the
// prospect's own type, never user-chosen (unlike the Lead Gen CRM's
// multi-saved-template picker). Deliberately has no "server-only" import:
// ProspectEmailModal (a client component) calls getDefaultProspectEmailTemplate
// directly to prefill the editable subject/message fields, and none of
// this file touches secrets or a database.
//
// None of the copy below uses a prohibited claim (guaranteed appointments/
// leads/financing/approval, pre-approved financing) - keep it that way if
// this copy is ever edited.

export type ProspectEmailDefaults = {
  subject: string;
  message: string;
  ctaText: string;
};

// Matches the Lead Generation CRM's own consultation-invite wording
// (leadgen_email_templates, key "consultation_information") - a short
// "thank you for speaking with us" note, one sentence on how we can help,
// a direct ask to book, then a brief signature. Every Growth CRM
// communication email is branded as the company only - no agent's name
// appears anywhere in the email (sender display name, greeting, or
// closing), matching the Lead Gen CRM's own "{client} Team" convention of
// signing as the business rather than an individual.
function firstNameOnly(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "";
}

// Fixed, brand-only closing - matches the exact closing already used by
// the Winsalot consultation-booking emails
// (src/lib/winsalot-consultation-emails.ts).
const CONSULTATION_EMAIL_CLOSING = ["Best regards,", "Winsalot Corp"].join("\n");

// Fixed subject/CTA label for every Growth CRM prospect email, regardless
// of opportunity_type - matches the Lead Generation CRM's own
// "consultation_information" template subject exactly (see
// supabase/migrations/0046_leadgen_fix_consultation_email_newlines.sql),
// replacing the three type-specific subjects this template used to have.
const CONSULTATION_EMAIL_SUBJECT = "Following up on our conversation";
const CONSULTATION_EMAIL_CTA_LABEL = "Schedule a call";
const BOOKING_LINK_MARKER = "As discussed, you can choose a convenient time for a short call using this link:";

export function getDefaultProspectEmailTemplate(
  opportunityType: OpportunityType,
  params: { businessName: string; contactName: string }
): ProspectEmailDefaults {
  // Recipient's first name only when available, otherwise "there" - never
  // an agent's name.
  const contactName = firstNameOnly(params.contactName) || "there";
  const ctaText = CONSULTATION_EMAIL_CTA_LABEL;

  // The same restrained, conversational follow-up is used for every
  // service type. Service-specific sales claims and "free consultation"
  // language are intentionally omitted to keep this looking like the
  // one-to-one follow-up it is.
  return {
    subject: CONSULTATION_EMAIL_SUBJECT,
    message: [
      `Hi ${contactName},`,
      "",
      "Thank you for taking the time to speak with us.",
      "",
      BOOKING_LINK_MARKER,
      "",
      "Please reply to this email if you have any questions.",
      "",
      CONSULTATION_EMAIL_CLOSING,
    ].join("\n"),
    ctaText,
  };
}

// The exact sentence the single plain booking link is inserted after. If a
// sender removes it while editing, the link safely falls back to the end.
function splitMessageAtCtaMarker(message: string): { before: string; after: string } {
  const index = message.indexOf(BOOKING_LINK_MARKER);
  if (index === -1) {
    return { before: message, after: "" };
  }
  const splitAt = index + BOOKING_LINK_MARKER.length;
  return { before: message.slice(0, splitAt).trimEnd(), after: message.slice(splitAt).trimStart() };
}

// Renders the user-edited message + CTA + booking link into the final
// email bodies sent via Resend. `message` is split on blank lines into
// paragraphs; a single newline within a paragraph (e.g. the multi-line
// signature block) becomes a <br> rather than a new paragraph, so the
// signature stays visually together. The CTA link appears exactly once,
// immediately after CTA_INSERTION_MARKER - never repeated at the end.
//
// No visible unsubscribe footer here - CASL still requires a working
// unsubscribe mechanism on this commercial outreach, but it's carried
// entirely by the List-Unsubscribe/List-Unsubscribe-Post headers
// sendProspectEmail sets on every send (see send-prospect-email.ts).
// Gmail and Outlook both render those headers as a native one-click
// "Unsubscribe" link next to the sender name, so the mechanism stays
// real and visible without a marketing-style footer in the body.
export function buildProspectEmailText(input: { message: string; ctaText: string; bookingUrl: string }): string {
  const { before, after } = splitMessageAtCtaMarker(input.message.trim());
  const parts = [before, `${input.ctaText}: ${input.bookingUrl}`];
  if (after) parts.push(after);
  return parts.join("\n\n");
}

function paragraphsHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#111827;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");
}

// One normal inline text link. Avoid button styling so the email retains a
// simple one-to-one follow-up appearance.
function bookingLinkHtml(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8; text-decoration:underline;">${safeLabel}</a></p>`;
}

// Plain personal-email layout - a bare div, no <!DOCTYPE>/<html>/<head>/
// <body>/<table> document wrapper, no banner, no footer - so the email
// still reads like something a person sent from their own inbox. The one
// booking link is placed immediately after BOOKING_LINK_MARKER (see
// buildProspectEmailText above for where the
// CASL-required unsubscribe mechanism lives instead of a visible footer
// here). The button never repeats elsewhere in the email.
export function buildProspectEmailHtml(input: { message: string; ctaText: string; bookingUrl: string }): string {
  const { before, after } = splitMessageAtCtaMarker(input.message.trim());

  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#111827;">
${paragraphsHtml(before)}
${bookingLinkHtml(input.bookingUrl, input.ctaText)}
${paragraphsHtml(after)}
</div>`;
}
