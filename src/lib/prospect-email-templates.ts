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

export function getDefaultProspectEmailTemplate(
  opportunityType: OpportunityType,
  params: { businessName: string; contactName: string; agentName: string }
): ProspectEmailDefaults {
  const businessName = params.businessName;
  const contactName = params.contactName || "there";
  const agentName = params.agentName;
  const ctaText = "Book a free 15-minute consultation";

  if (opportunityType === "business_financing") {
    return {
      subject: `Explore financing options for ${businessName}`,
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
      subject: `Let's discuss growth opportunities for ${businessName}`,
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
    subject: `Let's discuss growing ${businessName}`,
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

// Renders the user-edited message + CTA + booking link into the final
// email bodies sent via Resend. `message` is split on blank lines into
// paragraphs; a single newline within a paragraph (e.g. the multi-line
// signature block) becomes a <br> rather than a new paragraph, so the
// signature stays visually together.
//
// No visible unsubscribe footer here - CASL still requires a working
// unsubscribe mechanism on this commercial outreach, but it's carried
// entirely by the List-Unsubscribe/List-Unsubscribe-Post headers
// sendProspectEmail sets on every send (see send-prospect-email.ts).
// Gmail and Outlook both render those headers as a native one-click
// "Unsubscribe" link next to the sender name, so the mechanism stays
// real and visible without a marketing-style footer in the body - the
// same plain personal-email body the Lead Generation CRM sends.
export function buildProspectEmailText(input: { message: string; ctaText: string; bookingUrl: string }): string {
  return [input.message.trim(), "", `${input.ctaText}: ${input.bookingUrl}`].join("\n");
}

// Plain personal-email layout matching the Lead Generation CRM's own
// (src/lib/leadgen-email.ts's textToSimpleHtml/leadgenButtonHtml): a bare
// div, no <!DOCTYPE>/<html>/<head>/<body>/<table> document wrapper, no
// banner, no colored background, no large button, no footer - just
// black-on-white text and a single inline text link, so the email reads
// like something a person sent from their own inbox rather than a
// marketing campaign built from an HTML email template. This is the
// single biggest lever this app has over landing in Gmail's Promotions
// tab instead of the primary inbox. See buildProspectEmailText above for
// where the CASL-required unsubscribe mechanism actually lives now that
// it's no longer a visible footer here.
export function buildProspectEmailHtml(input: { message: string; ctaText: string; bookingUrl: string }): string {
  const paragraphs = input.message
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#111827;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");

  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#111827;">
${paragraphs}
<p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;">
  <a href="${escapeHtml(input.bookingUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1a56db; text-decoration:underline;">${escapeHtml(input.ctaText)}</a>
</p>
</div>`;
}
