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

// Renders the user-edited message + CTA + booking link + unsubscribe
// footer into the final email bodies sent via Resend. `message` is split
// on blank lines into paragraphs; a single newline within a paragraph
// (e.g. the multi-line signature block) becomes a <br> rather than a new
// paragraph, so the signature stays visually together.
export function buildProspectEmailText(input: {
  message: string;
  ctaText: string;
  bookingUrl: string;
  unsubscribeUrl: string;
}): string {
  return [
    input.message.trim(),
    "",
    `${input.ctaText}: ${input.bookingUrl}`,
    "",
    "---",
    "You're receiving this because you spoke with Winsalot Corp about growing your business.",
    `Unsubscribe from future emails: ${input.unsubscribeUrl}`,
  ].join("\n");
}

// Plain personal-email layout per the deliverability brief: no banner,
// no colored background, no large button - just black-on-white text and
// a single inline text link, so the email reads like something a person
// sent from their own inbox rather than a marketing campaign (the single
// biggest lever this app has over landing in Gmail's Promotions tab
// instead of the primary inbox).
export function buildProspectEmailHtml(input: {
  message: string;
  ctaText: string;
  bookingUrl: string;
  unsubscribeUrl: string;
}): string {
  const paragraphs = input.message
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#111827;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(input.ctaText)} — Winsalot Corp</title>
</head>
<body style="margin:0; padding:0; background-color:#ffffff; font-family: Arial, Helvetica, sans-serif; color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; padding:24px 20px;">
          <tr>
            <td>
              ${paragraphs}
              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;">
                <a href="${escapeHtml(input.bookingUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1a56db; text-decoration:underline;">${escapeHtml(input.ctaText)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:16px; border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 6px 0; font-size:12px; line-height:1.5; color:#6b7280;">
                You're receiving this because you spoke with Winsalot Corp about growing your business.
              </p>
              <p style="margin:0; font-size:12px; line-height:1.5; color:#6b7280;">
                <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b7280; text-decoration:underline;">Unsubscribe from future emails</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}
