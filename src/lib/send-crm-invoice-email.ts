import "server-only";
import type { createSupabaseServerClient } from "./supabase-server";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { renderInvoicePdfBuffer } from "./crm-invoice-pdf";
import { buildInvoiceReminderEmail, buildInvoiceSentEmail } from "./crm-invoice-emails";
import type { CrmInvoiceLineItemRow, CrmInvoiceRow } from "./crm-invoices-types";
import type { CrmUserRow } from "./crm-types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type SendCrmInvoiceEmailInput = {
  supabase: SupabaseClient;
  invoice: CrmInvoiceRow;
  clientCompanyName: string;
  clientEmail: string;
  lineItems: CrmInvoiceLineItemRow[];
  emailType: "invoice_sent" | "invoice_reminder";
  admin: CrmUserRow;
};

// The single place an invoice email is ever actually sent from - "every
// first send must require deliberate admin confirmation" and "resending
// or sending a reminder must not create a duplicate invoice" are both
// enforced by the caller (crm/invoices/actions.ts) before this runs;
// this function's own job is just: render the PDF, send it via Resend,
// and record every piece of tracking the brief requires (delivery
// status row, structured audit entry, human-readable activity entry,
// and the invoice's own first_sent_at/last_sent_at/last_reminder_at
// timestamps) - all against this exact invoice row, never a new one.
export async function sendCrmInvoiceEmail(input: SendCrmInvoiceEmailInput): Promise<void> {
  const { supabase, invoice, clientCompanyName, clientEmail, lineItems, emailType, admin } = input;

  const pdfBuffer = await renderInvoicePdfBuffer({ invoice, clientCompanyName, lineItems });
  const emailBody = emailType === "invoice_sent" ? buildInvoiceSentEmail(invoice, clientCompanyName) : buildInvoiceReminderEmail(invoice, clientCompanyName);

  const fromEmail = process.env.CRM_INVOICE_FROM_EMAIL || "Winsalot Corp <billing@winsalotcorp.com>";
  const resend = getResendClient();
  const { data: sendResult, error: emailError } = await resend.emails.send({
    from: fromEmail,
    to: clientEmail,
    subject: emailBody.subject,
    text: emailBody.text,
    html: emailBody.html,
    attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdfBuffer }],
  });

  if (emailError || !sendResult) {
    throw new Error(`Failed to send the invoice email: ${emailError?.message ?? "Unknown Resend error."}`);
  }

  const now = new Date().toISOString();
  const isFirstSend = emailType === "invoice_sent" && !invoice.first_sent_at;

  // crm_invoice_emails has no RLS policies of its own (service-role only,
  // matching crm_lead_emails) - see migration 0091.
  const adminClient = getSupabaseAdmin();
  const { error: trackingError } = await adminClient.from("crm_invoice_emails").insert({
    invoice_id: invoice.id,
    resend_email_id: sendResult.id,
    email_type: emailType,
    to_email: clientEmail,
    status: "sent",
    status_at: now,
    sent_at: now,
  });
  if (trackingError) {
    throw new Error("The email was sent, but delivery tracking could not be recorded.");
  }

  const invoiceUpdates: Record<string, unknown> = {};
  if (emailType === "invoice_sent") {
    invoiceUpdates.last_sent_at = now;
    if (isFirstSend) invoiceUpdates.first_sent_at = now;
    if (invoice.status === "Draft") invoiceUpdates.status = "Sent";
  } else {
    invoiceUpdates.last_reminder_at = now;
  }
  const { error: invoiceUpdateError } = await supabase.from("crm_invoices").update(invoiceUpdates).eq("id", invoice.id);
  if (invoiceUpdateError) {
    throw new Error("The email was sent, but updating the invoice's send tracking failed.");
  }

  const performedByName = admin.full_name || admin.email;
  const auditAction = emailType === "invoice_reminder" ? "reminder_sent" : isFirstSend ? "sent" : "resent";
  await supabase.from("crm_invoice_audit").insert({
    invoice_id: invoice.id,
    client_id: invoice.client_id,
    invoice_number: invoice.invoice_number,
    action: auditAction,
    details: `Emailed to ${clientEmail} by ${performedByName}.`,
    performed_by_name: performedByName,
  });

  await supabase.from("crm_activities").insert({
    client_id: invoice.client_id,
    invoice_id: invoice.id,
    agent_id: admin.id,
    activity_type: emailType === "invoice_reminder" ? "invoice_reminder_sent" : "invoice_sent",
    notes: `Invoice ${invoice.invoice_number} ${emailType === "invoice_reminder" ? "payment reminder" : "email"} sent to ${clientEmail} by ${performedByName}.`,
  });
}
