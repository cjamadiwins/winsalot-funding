import "server-only";
import { escapeHtml } from "./html";
import { getSiteUrl } from "./site-url";

type MarketingEmailParams = {
  bodyTemplate: string;
  subjectTemplate: string;
  firstName: string;
  businessName: string;
  ctaLabel: string;
  bookingUrl: string;
  unsubscribeUrl: string;
};

// Winsalot Corp.'s official head-office address (CASL/CAN-SPAM footer
// requirement). Fixed in code rather than read from an env var on
// purpose: WINSALOT_MAILING_ADDRESS previously let this compliance-
// critical detail silently drift to a stale value (the retired "20
// Leacrest Street" address) in Vercel without ever touching this file -
// a fixed physical address has no legitimate reason to differ by
// environment, so there is no longer an override to get wrong. Update
// this one place, and only this place, if Winsalot Corp. ever changes
// offices again.
const WINSALOT_HEAD_OFFICE_ADDRESS_LINE1 = "Head Office: 55 Rutherford Road South, Suite 3";
const WINSALOT_HEAD_OFFICE_ADDRESS_LINE2 = "Brampton, Ontario L6W 3J3, Canada";
const WINSALOT_PHONE = "647-300-1270";
const WINSALOT_EMAIL = "info@winsalotcorp.com";
const WINSALOT_WEBSITE_LABEL = "winsalotcorp.com";
const WINSALOT_WEBSITE_URL = "https://winsalotcorp.com";
const BRAND_BLUE = "#075985";

function replaceTokens(value: string, params: Pick<MarketingEmailParams, "firstName" | "businessName">): string {
  return value
    .replaceAll("{{first_name}}", params.firstName)
    .replaceAll("{{business_name}}", params.businessName);
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

// Winsalot Corp.-branded HTML shell around the admin-editable
// subject/body/CTA content. Table-based (not flexbox/CSS grid, no
// `margin:0 auto` centering reliance) specifically because Outlook's
// desktop renderer (Word's HTML engine) ignores most modern CSS -
// nested `<table role="presentation">` with a fixed pixel width is the
// only layout approach that reliably centers and constrains width across
// Gmail, Outlook, and mobile mail clients alike. Kept to a single
// max-600px card so it reads cleanly on a phone without any separate
// mobile-specific markup.
export function buildMarketingEmail(params: MarketingEmailParams): { subject: string; text: string; html: string } {
  const subject = replaceTokens(params.subjectTemplate, params);
  const body = replaceTokens(params.bodyTemplate, params);
  const logoUrl = `${getSiteUrl()}/winsalot-logo.png`;

  const text = [
    subject,
    body,
    `${params.ctaLabel}: ${params.bookingUrl}`,
    "",
    "Winsalot Corp.",
    WINSALOT_HEAD_OFFICE_ADDRESS_LINE1,
    WINSALOT_HEAD_OFFICE_ADDRESS_LINE2,
    `${WINSALOT_PHONE} · ${WINSALOT_EMAIL} · ${WINSALOT_WEBSITE_URL}`,
    `Unsubscribe: ${params.unsubscribeUrl}`,
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
              <h1 style="margin:0 0 18px;font-size:21px;line-height:1.35;color:#0f172a;font-weight:700;">${escapeHtml(subject)}</h1>
              ${paragraphsHtml(body)}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 28px 34px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${BRAND_BLUE};border-radius:8px;">
                    <a href="${escapeHtml(params.bookingUrl)}" style="display:inline-block;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 30px;">${escapeHtml(params.ctaLabel)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:22px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">
                <strong style="color:#334155;">Winsalot Corp.</strong><br>
                ${escapeHtml(WINSALOT_HEAD_OFFICE_ADDRESS_LINE1)}<br>
                ${escapeHtml(WINSALOT_HEAD_OFFICE_ADDRESS_LINE2)}<br>
                ${WINSALOT_PHONE} · <a href="mailto:${WINSALOT_EMAIL}" style="color:${BRAND_BLUE};">${WINSALOT_EMAIL}</a> · <a href="${WINSALOT_WEBSITE_URL}" style="color:${BRAND_BLUE};">${WINSALOT_WEBSITE_LABEL}</a><br>
                <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:${BRAND_BLUE};text-decoration:underline;">Unsubscribe from marketing emails</a>
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

export function firstNameForMarketing(contactName: string | null): string {
  return contactName?.trim().split(/\s+/)[0] || "there";
}
