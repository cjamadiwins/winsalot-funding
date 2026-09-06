import "server-only";
import { escapeHtml } from "./html";
import { getSiteUrl } from "./site-url";
import type { RetentionCampaignType } from "./crm-retention-types";

type RetentionEmailParams = {
  campaignType: RetentionCampaignType;
  bodyTemplate: string;
  subjectTemplate: string;
  firstName: string;
  businessName: string;
};

// Same fixed CASL/CAN-SPAM footer address as crm-marketing-email.ts -
// intentionally duplicated rather than imported, since retention email
// copy/branding is independent of the marketing module (brief: keep the
// two systems separate).
const WINSALOT_HEAD_OFFICE_ADDRESS_LINE1 = "Head Office: 55 Rutherford Road South, Suite 3";
const WINSALOT_HEAD_OFFICE_ADDRESS_LINE2 = "Brampton, Ontario L6W 3J3, Canada";
const WINSALOT_PHONE = "647-300-1270";
const WINSALOT_EMAIL = "info@winsalotcorp.com";
const WINSALOT_WEBSITE_LABEL = "winsalotcorp.com";
const WINSALOT_WEBSITE_URL = "https://winsalotcorp.com";
const BRAND_BLUE = "#075985";

// External branding label shown in the email itself - brief section 2:
// "Externally, do NOT call this a 'loyalty program.'" Follow-Up and
// Re-Engagement are plain relationship emails with no special masthead
// label at all; only Client Success gets the "Winsalot Client Success"
// eyebrow, per the brief's suggested branding.
function eyebrowLabel(campaignType: RetentionCampaignType): string | null {
  return campaignType === "client_success" ? "Winsalot Client Success" : null;
}

function replaceTokens(value: string, params: Pick<RetentionEmailParams, "firstName" | "businessName">): string {
  return value.replaceAll("{{first_name}}", params.firstName).replaceAll("{{business_name}}", params.businessName);
}

function paragraphsHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#1e293b;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");
}

// Winsalot Corp.-branded, relationship-focused email shell (brief section
// 8: "concise, professional, relationship-focused... not aggressive sales
// emails") - no call-to-action button at all, unlike the marketing
// module's buildMarketingEmail. Same table-based HTML for Outlook
// compatibility as crm-marketing-email.ts.
export function buildRetentionEmail(params: RetentionEmailParams): { subject: string; text: string; html: string } {
  const subject = replaceTokens(params.subjectTemplate, params);
  const body = replaceTokens(params.bodyTemplate, params);
  const logoUrl = `${getSiteUrl()}/winsalot-logo.png`;
  const eyebrow = eyebrowLabel(params.campaignType);

  const text = [
    ...(eyebrow ? [eyebrow] : []),
    subject,
    body,
    "",
    "Winsalot Corp.",
    WINSALOT_HEAD_OFFICE_ADDRESS_LINE1,
    WINSALOT_HEAD_OFFICE_ADDRESS_LINE2,
    `${WINSALOT_PHONE} · ${WINSALOT_EMAIL} · ${WINSALOT_WEBSITE_URL}`,
  ].join("\n\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f6;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="background-color:${BRAND_BLUE};padding:28px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#ffffff;border-radius:10px;padding:8px 16px;">
                    <img src="${logoUrl}" width="150" alt="Winsalot Corp." style="display:block;border:0;outline:none;max-width:150px;height:auto;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 4px;">
              ${eyebrow ? `<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND_BLUE};">${escapeHtml(eyebrow)}</p>` : ""}
              <h1 style="margin:0 0 18px;font-size:21px;line-height:1.35;color:#0f172a;font-weight:700;">${escapeHtml(subject)}</h1>
              ${paragraphsHtml(body)}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:22px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">
                <strong style="color:#334155;">Winsalot Corp.</strong><br>
                ${escapeHtml(WINSALOT_HEAD_OFFICE_ADDRESS_LINE1)}<br>
                ${escapeHtml(WINSALOT_HEAD_OFFICE_ADDRESS_LINE2)}<br>
                ${WINSALOT_PHONE} · <a href="mailto:${WINSALOT_EMAIL}" style="color:${BRAND_BLUE};">${WINSALOT_EMAIL}</a> · <a href="${WINSALOT_WEBSITE_URL}" style="color:${BRAND_BLUE};">${WINSALOT_WEBSITE_LABEL}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export function firstNameForRetention(contactName: string | null): string {
  return contactName?.trim().split(/\s+/)[0] || "there";
}
