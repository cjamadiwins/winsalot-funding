import "server-only";
import type { createSupabaseServerClient } from "./supabase-server";
import { getResendClient } from "./resend";
import { getEmailReplyTo, getEmailSender } from "./email-senders";
import { getSupabaseAdmin } from "./supabase-admin";
import { renderInvoicePdfBuffer } from "./crm-invoice-pdf";
import { renderInvoiceEmailBody } from "./crm-invoice-emails";
import type { CrmInvoiceLineItemRow, CrmInvoiceRow } from "./crm-invoices-types";
import type { CrmUserRow } from "./crm-types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CrmInvoiceEmailType = "invoice_sent" | "invoice_reminder" | "invoice_receipt";

type SendCrmInvoiceEmailInput = {
  supabase: SupabaseClient;
  invoice: CrmInvoiceRow;
  clientCompanyName: string;
  toEmail: string;
  subject: string;
  message: string;
  lineItems: CrmInvoiceLineItemRow[];
  emailType: CrmInvoiceEmailType;
  admin: CrmUserRow;
};

// The single place an invoice email is ever actually sent from - "every
// first send must require deliberate admin confirmation" and "resending
// or sending a reminder must not create a duplicate invoice" are both
// enforced by the caller (crm/invoices/actions.ts) before this runs;
// this function's own job is just: render the PDF (invoice_sent/
// invoice_reminder only - a receipt has nothing new to attach), send it
// via Resend from the Winsalot Billing identity, and record every piece
// of tracking the brief requires (delivery status row, structured audit
// entry, human-readable activity entry, and the invoice's own
// first_sent_at/last_sent_at/last_reminder_at timestamps) - all against
// this exact invoice row, never a new one. `subject`/`message` are
// already fully resolved by the caller (the template default, or the
// admin's own edit from the preview step) - this never rebuilds them.
export async function sendCrmInvoiceEmail(input: SendCrmInvoiceEmailInput): Promise<void> {
  const { supabase, invoice, clientCompanyName, toEmail, subject, message, lineItems, emailType, admin } = input;

  const emailBody = renderInvoiceEmailBody(subject, message);
  const attachments =
    emailType === "invoice_receipt"
      ? undefined
      : [{ filename: `${invoice.invoice_number}.pdf`, content: await renderInvoicePdfBuffer({ invoice, clientCompanyName, lineItems }) }];

  const resend = getResendClient();
  const { data: sendResult, error: emailError } = await resend.emails.send({
    from: getEmailSender("billing"),
    to: toEmail,
    replyTo: getEmailReplyTo(),
    subject: emailBody.subject,
    text: emailBody.text,
    html: emailBody.html,
    ...(attachments ? { attachments } : {}),
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
    to_email: toEmail,
    status: "sent",
    status_at: now,
    sent_at: now,
  });
  if (trackingError) {
    throw new Error("The email was sent, but delivery tracking could not be recorded.");
  }

  // A receipt is purely informational - it never changes the invoice's
  // status or send-tracking timestamps, unlike a send or a reminder.
  if (emailType !== "invoice_receipt") {
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
  }

  const performedByName = admin.full_name || admin.email;
  const auditAction = emailType === "invoice_reminder" ? "reminder_sent" : emailType === "invoice_receipt" ? "receipt_sent" : isFirstSend ? "sent" : "resent";
  await supabase.from("crm_invoice_audit").insert({
    invoice_id: invoice.id,
    client_id: invoice.client_id,
    invoice_number: invoice.invoice_number,
    action: auditAction,
    details: `Emailed to ${toEmail} by ${performedByName}.`,
    performed_by_name: performedByName,
  });

  const activityLabel = emailType === "invoice_reminder" ? "payment reminder" : emailType === "invoice_receipt" ? "payment receipt" : "email";
  await supabase.from("crm_activities").insert({
    client_id: invoice.client_id,
    invoice_id: invoice.id,
    agent_id: admin.id,
    activity_type: emailType === "invoice_reminder" ? "invoice_reminder_sent" : emailType === "invoice_receipt" ? "note" : "invoice_sent",
    notes: `Invoice ${invoice.invoice_number} ${activityLabel} sent to ${toEmail} by ${performedByName}.`,
  });
}
