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

function signatureBlock(agentName: string): string {
  return [
    "Best regards,",
    agentName,
    "Winsalot Corp",
    "Empowering Businesses, One Solution at a Time.",
    "647-300-1270",
    "info@winsalotcorp.com",
    "winsalotcorp.com",
  ].join("\n");
}

export function getDefaultProspectEmailTemplate(
  opportunityType: OpportunityType,
  params: { businessName: string; contactName: string; agentName: string }
): ProspectEmailDefaults {
  const businessName = params.businessName;
  const contactName = params.contactName || "there";
  const agentName = params.agentName;

  if (opportunityType === "business_financing") {
    return {
      subject: `Explore financing options for ${businessName}`,
      message: [
        `Hi ${contactName},`,
        "",
        "Thank you for speaking with us.",
        "",
        "Winsalot Corp helps established Canadian businesses explore financing options through our network of business-funding partners.",
        "",
        "During a free 15-minute consultation, we can learn about your business, discuss your financing needs and explain the information that may be required to determine whether suitable options are available.",
        "",
        "There is no obligation, and all financing is subject to lender assessment and approval.",
        "",
        signatureBlock(agentName),
      ].join("\n"),
      ctaText: "Explore Your Business Financing Options",
    };
  }

  if (opportunityType === "both_services") {
    return {
      subject: `Let's discuss growth opportunities for ${businessName}`,
      message: [
        `Hi ${contactName},`,
        "",
        "Thank you for speaking with us.",
        "",
        "Winsalot Corp supports businesses in two important areas: generating new sales opportunities and exploring business-financing options.",
        "",
        "We would like to learn more about your goals and determine which type of support may be most useful for your business.",
        "",
        "Schedule a free 15-minute consultation with our team to discuss your business needs.",
        "",
        "There is no obligation. Financing options, when requested, are subject to lender assessment and approval.",
        "",
        signatureBlock(agentName),
      ].join("\n"),
      ctaText: "Book a Free 15-Minute Business Consultation",
    };
  }

  // "lead_generation" (default)
  return {
    subject: `Let's discuss growing ${businessName}`,
    message: [
      `Hi ${contactName},`,
      "",
      "Thank you for speaking with us.",
      "",
      "Winsalot Corp helps businesses connect with potential customers through professional B2B outreach and appointment setting. We would like to learn more about your business, the customers you want to reach and your current growth objectives.",
      "",
      "You can schedule a free 15-minute consultation with our team to discuss how we may be able to support your business.",
      "",
      "There is no obligation.",
      "",
      signatureBlock(agentName),
    ].join("\n"),
    ctaText: "Book a Free 15-Minute Growth Consultation",
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
