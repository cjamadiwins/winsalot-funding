import { escapeHtml } from "./html";
import { formatCurrency, PAYMENT_METHOD_LABELS, type CrmPaymentRow } from "./crm-clients-types";
import type { CrmInvoiceRow } from "./crm-invoices-types";

// Winsalot Billing invoice email templates. Plain personal-email layout
// per the deliverability brief: no banner, no colored background - just
// black-on-white text, so a genuinely transactional email (an invoice
// the client is expecting) doesn't visually read as marketing and land
// in Promotions. Written as its own independent copy rather than shared
// with winsalot-consultation-emails.ts, matching this codebase's
// existing convention of keeping each feature's email templates
// self-contained.
//
// Every "build...Email" function below returns the *default* subject and
// plain-text message for that email type - the admin can edit both
// before sending (see previewInvoiceEmailAction/sendInvoiceAction in
// crm/invoices/actions.ts), so renderInvoiceEmailBody is the one place
// that actually turns a subject+message (default or edited) into the
// final HTML, keeping default and edited sends visually identical.

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
<body style="margin:0; padding:0; background-color:#ffffff; font-family: Arial, Helvetica, sans-serif; color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; padding:24px 20px;">
          <tr>
            <td>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding-top:16px; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:12px; line-height:1.6; color:#6b7280;">
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

// Converts a plain-text message (the admin's own editable subject/message
// input) into the same plain paragraph styling every invoice email
// uses - blank-line-separated blocks become paragraphs, a single
// newline within a block becomes a line break, so an edited message
// renders exactly as the admin sees it in the preview textarea.
function messageToHtml(message: string): string {
  return message
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#111827;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");
}

// The one place a subject+message (default or admin-edited) becomes the
// actual email that gets sent.
export function renderInvoiceEmailBody(subject: string, message: string): InvoiceEmailBody {
  return { subject, text: message, html: shell(messageToHtml(message), subject) };
}

function formatInvoiceDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatServicePeriod(invoice: Pick<CrmInvoiceRow, "service_period_start" | "service_period_end">): string {
  if (!invoice.service_period_start && !invoice.service_period_end) return "Not specified";
  return `${formatInvoiceDate(invoice.service_period_start)} - ${formatInvoiceDate(invoice.service_period_end)}`;
}

const SIGNATURE_LINES = [
  "Best regards,",
  "Winsalot Billing",
  "Winsalot Corp",
  "Empowering Businesses, One Solution at a Time.",
  "info@winsalotcorp.com",
  "647-300-1270",
  "winsalotcorp.com",
];

// Names the exact invoice, per the deliverability brief - a subject like
// "Your Monthly Invoice from Winsalot Corp" repeats identically across
// every client/month and reads as a mail-merge blast; naming the invoice
// number instead reads as one specific, expected transactional notice.
export function defaultInvoiceSentSubject(invoiceNumber: string): string {
  return `Invoice ${invoiceNumber} from Winsalot Corp`;
}

// The exact default monthly invoice email template from the brief, with
// every bracketed field replaced from the real invoice/client data.
// "Amount due" is the invoice's remaining balance (equal to the total on
// a fresh, unpaid invoice, but still correct if this is a resend after a
// partial payment). The opening line is the brief's exact required
// wording, verbatim.
export function buildDefaultInvoiceSentMessage(
  invoice: Pick<CrmInvoiceRow, "invoice_number" | "service_period_start" | "service_period_end" | "balance" | "currency" | "due_date">,
  clientDisplayName: string
): string {
  return [
    `Hi ${clientDisplayName},`,
    "",
    "Thank you for choosing Winsalot Corp. Below is your monthly invoice.",
    "",
    `Invoice number: ${invoice.invoice_number}`,
    `Invoice period: ${formatServicePeriod(invoice)}`,
    `Amount due: ${formatCurrency(invoice.balance, invoice.currency)}`,
    `Due date: ${formatInvoiceDate(invoice.due_date)}`,
    "",
    "If you have already made the payment, please disregard this notice. If you have any questions about your invoice, reply to this email and we will be happy to assist you.",
    "",
    "We appreciate your business and look forward to continuing to support your growth.",
    "",
    ...SIGNATURE_LINES,
  ].join("\n");
}

export function buildInvoiceSentEmail(
  invoice: Pick<CrmInvoiceRow, "invoice_number" | "service_period_start" | "service_period_end" | "balance" | "currency" | "due_date">,
  clientDisplayName: string
): InvoiceEmailBody {
  return renderInvoiceEmailBody(defaultInvoiceSentSubject(invoice.invoice_number), buildDefaultInvoiceSentMessage(invoice, clientDisplayName));
}

export function defaultInvoiceReminderSubject(invoiceNumber: string): string {
  return `Payment Reminder: Invoice ${invoiceNumber} from Winsalot Corp`;
}

// "Payment reminders must clearly show: client name, invoice number,
// original due date, total, amount paid, outstanding balance, payment
// instructions."
export function buildDefaultInvoiceReminderMessage(
  invoice: Pick<CrmInvoiceRow, "invoice_number" | "due_date" | "total" | "amount_paid" | "balance" | "currency" | "payment_instructions">,
  clientDisplayName: string
): string {
  const lines = [
    `Hi ${clientDisplayName},`,
    "",
    `This is a friendly reminder that Invoice ${invoice.invoice_number} from Winsalot Corp has a balance due.`,
    "",
    `Invoice number: ${invoice.invoice_number}`,
    `Original due date: ${formatInvoiceDate(invoice.due_date)}`,
    `Total: ${formatCurrency(invoice.total, invoice.currency)}`,
    `Amount paid: ${formatCurrency(invoice.amount_paid, invoice.currency)}`,
    `Outstanding balance: ${formatCurrency(invoice.balance, invoice.currency)}`,
  ];
  if (invoice.payment_instructions) lines.push("", "Payment Instructions:", invoice.payment_instructions);
  lines.push("", "If you've already sent payment, please disregard this reminder.", "", ...SIGNATURE_LINES);
  return lines.join("\n");
}

export function buildInvoiceReminderEmail(
  invoice: Pick<CrmInvoiceRow, "invoice_number" | "due_date" | "total" | "amount_paid" | "balance" | "currency" | "payment_instructions">,
  clientDisplayName: string
): InvoiceEmailBody {
  return renderInvoiceEmailBody(defaultInvoiceReminderSubject(invoice.invoice_number), buildDefaultInvoiceReminderMessage(invoice, clientDisplayName));
}

export function defaultInvoiceReceiptSubject(invoiceNumber: string): string {
  return `Payment Receipt: Invoice ${invoiceNumber} from Winsalot Corp`;
}

// "When an invoice is marked Paid, allow admin to send a receipt
// showing: invoice number, amount paid, payment date, payment method,
// payment reference, remaining balance or zero balance." `payment` is
// the specific payment record the receipt is for (usually the one that
// completed the invoice); `invoice.balance` reflects the true remaining
// balance across every payment, not just this one.
export function buildDefaultInvoiceReceiptMessage(
  invoice: Pick<CrmInvoiceRow, "invoice_number" | "balance" | "currency">,
  clientDisplayName: string,
  payment: Pick<CrmPaymentRow, "amount" | "currency" | "payment_date" | "payment_method" | "reference_number">
): string {
  const remainingBalance = Number(invoice.balance);
  const lines = [
    `Hi ${clientDisplayName},`,
    "",
    "Thank you for your payment. Here is your receipt.",
    "",
    `Invoice number: ${invoice.invoice_number}`,
    `Amount paid: ${formatCurrency(payment.amount, payment.currency)}`,
    `Payment date: ${formatInvoiceDate(payment.payment_date)}`,
    `Payment method: ${payment.payment_method ? PAYMENT_METHOD_LABELS[payment.payment_method] : "Not specified"}`,
    `Payment reference: ${payment.reference_number || "-"}`,
    `Remaining balance: ${remainingBalance > 0 ? formatCurrency(remainingBalance, invoice.currency) : `${formatCurrency(0, invoice.currency)} (paid in full)`}`,
    "",
    "Thank you for your business.",
    "",
    ...SIGNATURE_LINES,
  ];
  return lines.join("\n");
}

export function buildInvoiceReceiptEmail(
  invoice: Pick<CrmInvoiceRow, "invoice_number" | "balance" | "currency">,
  clientDisplayName: string,
  payment: Pick<CrmPaymentRow, "amount" | "currency" | "payment_date" | "payment_method" | "reference_number">
): InvoiceEmailBody {
  return renderInvoiceEmailBody(defaultInvoiceReceiptSubject(invoice.invoice_number), buildDefaultInvoiceReceiptMessage(invoice, clientDisplayName, payment));
}
