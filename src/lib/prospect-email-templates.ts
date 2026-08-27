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
// (leadgen_email_templates, key "consultation_information", combined with
// buildLeadgenConsultationCtaEmail's signature block in leadgen-email.ts)
// - a short "thank you for speaking with us" note, one sentence on how we
// can help, a direct ask to book, then a brief signature. Kept as close
// as this domain allows: unlike the Lead Gen CRM's client-outreach email
// (signed "{client} Team", since it's the client's own outreach, not an
// individual's), a Growth CRM prospect email is always from a specific
// agent reaching out personally, so the signature keeps their real name
// rather than switching to a generic "Team" sign-off.
function signatureBlock(agentName: string): string {
  return ["Best,", agentName, "Winsalot Corp", "Website: winsalotcorp.com"].join("\n");
}

// Fixed subject/CTA label for every Growth CRM prospect email, regardless
// of opportunity_type - matches the Lead Generation CRM's own
// "consultation_information" template subject exactly (see
// supabase/migrations/0046_leadgen_fix_consultation_email_newlines.sql),
// replacing the three type-specific subjects this template used to have.
const CONSULTATION_EMAIL_SUBJECT = "Book Your Free 15-Minute Business Growth Consultation";
const CONSULTATION_EMAIL_CTA_LABEL = "Book a Free 15-Minute Consultation";

export function getDefaultProspectEmailTemplate(
  opportunityType: OpportunityType,
  params: { businessName: string; contactName: string; agentName: string }
): ProspectEmailDefaults {
  const contactName = params.contactName || "there";
  const agentName = params.agentName;
  const ctaText = CONSULTATION_EMAIL_CTA_LABEL;

  if (opportunityType === "business_financing") {
    return {
      subject: CONSULTATION_EMAIL_SUBJECT,
      message: [
        `Hi ${contactName},`,
        "",
        "Thank you for taking the time to speak with us.",
        "",
        "We would love the opportunity to show you how Winsalot Corp can help you explore financing options and take the next step for your business.",
        "",
        "Please click the button below to schedule your free 15-minute consultation. There is no obligation, and all financing is subject to lender assessment and approval.",
        "",
        "You can reply to this email, or use the booking link below to choose a convenient time:",
        "",
        signatureBlock(agentName),
      ].join("\n"),
      ctaText,
    };
  }

  if (opportunityType === "both_services") {
    return {
      subject: CONSULTATION_EMAIL_SUBJECT,
      message: [
        `Hi ${contactName},`,
        "",
        "Thank you for taking the time to speak with us.",
        "",
        "We would love the opportunity to show you how Winsalot Corp can help generate more qualified leads for your business and explore financing options to support your growth.",
        "",
        "Please click the button below to schedule your free 15-minute consultation. There is no obligation, and financing options, when requested, are subject to lender assessment and approval.",
        "",
        "You can reply to this email, or use the booking link below to choose a convenient time:",
        "",
        signatureBlock(agentName),
      ].join("\n"),
      ctaText,
    };
  }

  // "lead_generation" (default)
  return {
    subject: CONSULTATION_EMAIL_SUBJECT,
    message: [
      `Hi ${contactName},`,
      "",
      "Thank you for taking the time to speak with us.",
      "",
      "We would love the opportunity to show you how Winsalot Corp can help improve your operations, generate more qualified leads, streamline your workflow, and grow your business.",
      "",
      "Please click the button below to schedule your free 15-minute consultation.",
      "",
      "You can reply to this email, or use the booking link below to choose a convenient time:",
      "",
      signatureBlock(agentName),
    ].join("\n"),
    ctaText,
  };
}

// The exact sentence the CTA button is inserted immediately after. Every
// default template above contains this sentence verbatim (business_financing
// and both_services continue it with a lender-disclosure clause in the same
// paragraph), so splitting on it places the button in the same spot no
// matter which opportunity_type generated the message. If a sender edits
// this sentence out of the message in ProspectEmailModal before sending,
// the button falls back to appearing after the whole message instead of
// disappearing - there's always exactly one CTA.
const CTA_INSERTION_MARKER = "Please click the button below to schedule your free 15-minute consultation.";

function splitMessageAtCtaMarker(message: string): { before: string; after: string } {
  const index = message.indexOf(CTA_INSERTION_MARKER);
  if (index === -1) {
    return { before: message, after: "" };
  }
  const splitAt = index + CTA_INSERTION_MARKER.length;
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

// One centered blue CTA button, per the brief - not the plain inline text
// link the Lead Generation CRM's own deliverability-focused templates use
// (src/lib/leadgen-email.ts's leadgenButtonHtml). Inline styles only, since
// this HTML is delivered as an email body (no external stylesheet, no
// <table> document wrapper elsewhere in this template).
function ctaButtonHtml(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<div style="text-align:center; margin:24px 0;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; background-color:#1a56db; color:#ffffff; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; text-decoration:none; padding:12px 28px; border-radius:6px;">${safeLabel}</a>
</div>`;
}

// Plain personal-email layout - a bare div, no <!DOCTYPE>/<html>/<head>/
// <body>/<table> document wrapper, no banner, no footer - so the email
// still reads like something a person sent from their own inbox, except
// for the one centered blue CTA button placed immediately after
// CTA_INSERTION_MARKER (see buildProspectEmailText above for where the
// CASL-required unsubscribe mechanism lives instead of a visible footer
// here). The button never repeats elsewhere in the email.
export function buildProspectEmailHtml(input: { message: string; ctaText: string; bookingUrl: string }): string {
  const { before, after } = splitMessageAtCtaMarker(input.message.trim());

  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#111827;">
${paragraphsHtml(before)}
${ctaButtonHtml(input.bookingUrl, input.ctaText)}
${paragraphsHtml(after)}
</div>`;
}
