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
        `<p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#374151;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
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
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; max-width:600px; width:100%;">

          <tr>
            <td style="background-color:#1e3a8a; padding:28px 40px; text-align:center;">
              <span style="color:#ffffff; font-size:20px; font-weight:bold; letter-spacing:0.5px;">Winsalot Corp</span>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              ${paragraphs}
              <div style="text-align:center; margin:28px 0 8px;">
                <a href="${escapeHtml(input.bookingUrl)}" target="_blank" rel="noopener noreferrer"
                   style="display:inline-block; background-color:#0284c7; color:#ffffff; text-decoration:none; font-weight:bold; font-size:15px; padding:14px 28px; border-radius:9999px;">
                  ${escapeHtml(input.ctaText)}
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px; background-color:#f9fafb; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px 0; font-size:12px; line-height:1.5; color:#9ca3af;">
                You're receiving this because you spoke with Winsalot Corp about growing your business.
              </p>
              <p style="margin:0; font-size:12px; line-height:1.5; color:#9ca3af;">
                <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#9ca3af; text-decoration:underline;">Unsubscribe from future emails</a>
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
