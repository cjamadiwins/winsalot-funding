import "server-only";
import { escapeHtml } from "./html";
import { getSiteUrl } from "./site-url";
import { formatReceiptDate, type ReceiptData } from "./crm-receipt";

export function defaultReceiptSubject(receipt: Pick<ReceiptData, "receiptNumber">): string {
  return `Payment receipt ${receipt.receiptNumber} from Winsalot Corp`;
}

// Branded (existing /winsalot-logo.png, same hosted-URL approach as
// crm-marketing-email.ts - base64 data URIs don't render in most inboxes).
export function renderReceiptEmail(receipt: ReceiptData): { subject: string; text: string; html: string } {
  const subject = defaultReceiptSubject(receipt);
  const logoUrl = `${getSiteUrl()}/winsalot-logo.png`;
  const greeting = receipt.contactName ? `Hi ${receipt.contactName},` : "Hello,";
  const text = [
    greeting,
    "",
    "Thank you - we've received your payment. Your receipt is below and attached as a PDF.",
    "",
    "Winsalot Corp",
    `Receipt No.: ${receipt.receiptNumber}`,
    `Receipt For: ${receipt.businessName}`,
    `Amount Paid: ${receipt.amountLabel}`,
    `Payment Date: ${formatReceiptDate(receipt.paymentDate)}`,
    `Description: ${receipt.description}`,
    `Status: ${receipt.status}`,
    "",
    "Winsalot Corp · Empowering Businesses, One Solution at a Time.",
    "info@winsalotcorp.com · 647-300-1270 · winsalotcorp.com",
  ].join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:140px;">${escapeHtml(label)}</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${value}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1e3a8a;padding:20px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${logoUrl}" width="44" alt="Winsalot Corp" style="display:block;border:0;height:auto;"></td>
    <td style="padding-left:12px;color:#ffffff;font-size:22px;font-weight:700;">Winsalot Corp</td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px;">
  <p style="margin:0 0 8px;font-size:16px;">${escapeHtml(greeting)}</p>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">Thank you - we've received your payment. Your receipt is below and attached as a PDF.</p>
  <p style="margin:0 0 4px;"><span style="display:inline-block;background:#059669;color:#ffffff;font-size:12px;font-weight:700;padding:4px 12px;border-radius:4px;">${receipt.status}</span></p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:12px;">
    ${row("Receipt No.", escapeHtml(receipt.receiptNumber))}
    ${row("Receipt For", escapeHtml(receipt.businessName))}
    ${row("Amount Paid", escapeHtml(receipt.amountLabel))}
    ${row("Payment Date", escapeHtml(formatReceiptDate(receipt.paymentDate)))}
    ${row("Description", escapeHtml(receipt.description))}
  </table>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;">
  Winsalot Corp · Empowering Businesses, One Solution at a Time.<br>647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
