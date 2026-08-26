import { escapeHtml } from "./html";
import { formatCurrency } from "./crm-clients-types";
import type { CrmInvoiceRow } from "./crm-invoices-types";

// Winsalot Corp branded invoice email templates. Same visual language as
// winsalot-consultation-emails.ts (dark-blue header, tagline, footer) -
// written as its own independent copy rather than shared, matching this
// codebase's existing convention of keeping each feature's email
// templates self-contained.

export type InvoiceEmailBody = { subject: string; text: string; html: string };

function shell(bodyHtml: string, title: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; max-width:600px; width:100%;">
          <tr>
            <td style="background-color:#1e3a8a; padding:28px 40px; text-align:center;">
              <span style="color:#ffffff; font-size:20px; font-weight:bold; letter-spacing:0.5px;">Winsalot Corp</span>
              <div style="color:#bfdbfe; font-size:12.5px; margin-top:4px;">Empowering Businesses, One Solution at a Time.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px; background-color:#f9fafb; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af;">
                Winsalot Corp · 647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
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

function paragraphsHtml(lines: string[]): string {
  return lines
    .map((line) => (line === "" ? "" : `<p style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#374151;">${escapeHtml(line)}</p>`))
    .join("\n");
}

function detailsTableHtml(rows: [string, string][]): string {
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 0; font-size:13px; color:#6b7280; width:160px;">${escapeHtml(label)}</td><td style="padding:4px 0; font-size:14px; color:#111827; font-weight:600;">${escapeHtml(value)}</td></tr>`
    )
    .join("\n");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; padding:12px 0;">${rowsHtml}</table>`;
}

function formatInvoiceDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function invoiceDetailRows(invoice: CrmInvoiceRow, clientCompanyName: string): [string, string][] {
  return [
    ["Invoice Number", invoice.invoice_number],
    ["Billed To", clientCompanyName],
    ["Issue Date", formatInvoiceDate(invoice.issue_date)],
    ["Due Date", formatInvoiceDate(invoice.due_date)],
    ["Total", formatCurrency(invoice.total, invoice.currency)],
    ["Balance Due", formatCurrency(invoice.balance, invoice.currency)],
  ];
}

export function buildInvoiceSentEmail(invoice: CrmInvoiceRow, clientCompanyName: string): InvoiceEmailBody {
  const subject = `Invoice ${invoice.invoice_number} from Winsalot Corp`;

  const textLines = [
    `Hi ${clientCompanyName},`,
    "",
    `Please find attached Invoice ${invoice.invoice_number} from Winsalot Corp.`,
    "",
    `Issue Date: ${formatInvoiceDate(invoice.issue_date)}`,
    `Due Date: ${formatInvoiceDate(invoice.due_date)}`,
    `Total: ${formatCurrency(invoice.total, invoice.currency)}`,
    `Balance Due: ${formatCurrency(invoice.balance, invoice.currency)}`,
  ];
  if (invoice.payment_instructions) textLines.push("", "Payment Instructions:", invoice.payment_instructions);
  if (invoice.client_facing_notes) textLines.push("", invoice.client_facing_notes);
  textLines.push("", "Thank you for your business.", "", "Best regards,", "Winsalot Corp", "Empowering Businesses, One Solution at a Time.", "647-300-1270", "info@winsalotcorp.com", "winsalotcorp.com");

  const bodyHtml = `
    ${paragraphsHtml([`Hi ${clientCompanyName},`, "", `Please find attached Invoice ${invoice.invoice_number} from Winsalot Corp.`])}
    ${detailsTableHtml(invoiceDetailRows(invoice, clientCompanyName))}
    ${invoice.payment_instructions ? paragraphsHtml(["Payment Instructions:", invoice.payment_instructions]) : ""}
    ${invoice.client_facing_notes ? paragraphsHtml([invoice.client_facing_notes]) : ""}
    ${paragraphsHtml(["Thank you for your business."])}
  `;

  return { subject, text: textLines.join("\n"), html: shell(bodyHtml, subject) };
}

export function buildInvoiceReminderEmail(invoice: CrmInvoiceRow, clientCompanyName: string): InvoiceEmailBody {
  const subject = `Payment Reminder: Invoice ${invoice.invoice_number} from Winsalot Corp`;

  const textLines = [
    `Hi ${clientCompanyName},`,
    "",
    `This is a friendly reminder that Invoice ${invoice.invoice_number} from Winsalot Corp has a balance due.`,
    "",
    `Due Date: ${formatInvoiceDate(invoice.due_date)}`,
    `Balance Due: ${formatCurrency(invoice.balance, invoice.currency)}`,
  ];
  if (invoice.payment_instructions) textLines.push("", "Payment Instructions:", invoice.payment_instructions);
  textLines.push("", "If you've already sent payment, please disregard this reminder.", "", "Best regards,", "Winsalot Corp");

  const bodyHtml = `
    ${paragraphsHtml([`Hi ${clientCompanyName},`, "", `This is a friendly reminder that Invoice ${invoice.invoice_number} from Winsalot Corp has a balance due.`])}
    ${detailsTableHtml([
      ["Invoice Number", invoice.invoice_number],
      ["Due Date", formatInvoiceDate(invoice.due_date)],
      ["Balance Due", formatCurrency(invoice.balance, invoice.currency)],
    ])}
    ${invoice.payment_instructions ? paragraphsHtml(["Payment Instructions:", invoice.payment_instructions]) : ""}
    ${paragraphsHtml(["If you've already sent payment, please disregard this reminder."])}
  `;

  return { subject, text: textLines.join("\n"), html: shell(bodyHtml, subject) };
}
