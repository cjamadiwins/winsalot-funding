import { escapeHtml } from "./html";

type MarketingEmailParams = {
  bodyTemplate: string;
  subjectTemplate: string;
  firstName: string;
  businessName: string;
  ctaLabel: string;
  bookingUrl: string;
  unsubscribeUrl: string;
  mailingAddress?: string;
};

const DEFAULT_MAILING_ADDRESS = "Brampton, Ontario, Canada";

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
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#172033;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function buildMarketingEmail(params: MarketingEmailParams): { subject: string; text: string; html: string } {
  const subject = replaceTokens(params.subjectTemplate, params);
  const body = replaceTokens(params.bodyTemplate, params);
  const mailingAddress = params.mailingAddress?.trim() || DEFAULT_MAILING_ADDRESS;

  const text = [
    body,
    `${params.ctaLabel}: ${params.bookingUrl}`,
    "",
    "Winsalot Corp",
    "647-300-1270 · info@winsalotcorp.com · https://winsalotcorp.com",
    mailingAddress,
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ].join("\n\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#172033;max-width:620px;margin:0 auto;">
${paragraphsHtml(body)}
<p style="margin:22px 0;"><a href="${escapeHtml(params.bookingUrl)}" style="display:inline-block;border-radius:8px;background:#075985;color:#ffffff;padding:12px 18px;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(params.ctaLabel)}</a></p>
<hr style="border:0;border-top:1px solid #e2e8f0;margin:28px 0 18px;">
<p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Winsalot Corp<br>647-300-1270 · <a href="mailto:info@winsalotcorp.com" style="color:#475569;">info@winsalotcorp.com</a> · <a href="https://winsalotcorp.com" style="color:#475569;">winsalotcorp.com</a><br>${escapeHtml(mailingAddress)}<br><a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#475569;text-decoration:underline;">Unsubscribe from marketing emails</a></p>
</div>`;

  return { subject, text, html };
}

export function firstNameForMarketing(contactName: string | null): string {
  return contactName?.trim().split(/\s+/)[0] || "there";
}

