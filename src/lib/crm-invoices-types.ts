import type { CrmClientRow } from "./crm-clients-types";

// Winsalot Growth CRM: Invoices (crm_invoices / crm_invoice_line_items /
// crm_invoice_audit / crm_invoice_emails, migration 0091). See that
// migration's header comment for the full design rationale.

export const INVOICE_STATUSES = ["Draft", "Sent", "Partially Paid", "Paid", "Overdue", "Cancelled", "Archived"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  Draft: "Draft",
  Sent: "Sent",
  "Partially Paid": "Partially Paid",
  Paid: "Paid",
  Overdue: "Overdue",
  Cancelled: "Cancelled",
  Archived: "Archived",
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-sky-100 text-sky-800",
  "Partially Paid": "bg-amber-100 text-amber-800",
  Paid: "bg-emerald-100 text-emerald-800",
  Overdue: "bg-rose-100 text-rose-700",
  Cancelled: "bg-slate-200 text-slate-600",
  Archived: "bg-slate-100 text-slate-500",
};

export const INVOICE_AUDIT_ACTIONS = [
  "created",
  "draft_saved",
  "edited",
  "duplicated",
  "sent",
  "resent",
  "reminder_sent",
  "payment_recorded",
  "payment_reversed",
  "marked_paid",
  "marked_partially_paid",
  "cancelled",
  "archived",
  "unarchived",
  "pdf_downloaded",
  "deleted",
  "receipt_sent",
] as const;
export type InvoiceAuditAction = (typeof INVOICE_AUDIT_ACTIONS)[number];

export type CrmInvoiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;

  client_id: string;
  invoice_number: string;

  billing_contact_name: string | null;
  billing_address: string | null;

  issue_date: string;
  due_date: string | null;
  service_period_start: string | null;
  service_period_end: string | null;

  currency: string;
  tax_rate: number;
  discount_amount: number;

  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance: number;

  status: InvoiceStatus;

  payment_instructions: string | null;
  admin_notes: string | null;
  client_facing_notes: string | null;

  first_sent_at: string | null;
  last_sent_at: string | null;
  last_reminder_at: string | null;

  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;

  archived_at: string | null;

  is_free_invoice: boolean;
};

export type CrmInvoiceWithClient = CrmInvoiceRow & {
  crm_clients: Pick<CrmClientRow, "id" | "company_name" | "email" | "status"> | null;
};

export type CrmInvoiceLineItemRow = {
  id: string;
  created_at: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
};

export type CrmInvoiceAuditRow = {
  id: string;
  invoice_id: string | null;
  client_id: string | null;
  invoice_number: string;
  action: InvoiceAuditAction;
  details: string | null;
  performed_by_name: string;
  occurred_at: string;
};

export type EmailEventStatus = "sent" | "delivered" | "delayed" | "bounced" | "complained" | "opened" | "clicked" | "failed";

export type CrmInvoiceEmailRow = {
  id: string;
  created_at: string;
  invoice_id: string;
  resend_email_id: string;
  email_type: "invoice_sent" | "invoice_reminder" | "invoice_receipt";
  to_email: string;
  status: EmailEventStatus;
  status_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  delayed_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
};

export type NewLineItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
  sort_order?: number;
};

export type NewCrmInvoiceInput = {
  client_id: string;
  billing_contact_name?: string;
  billing_address?: string;
  issue_date?: string;
  due_date?: string;
  service_period_start?: string;
  service_period_end?: string;
  currency?: string;
  tax_rate?: number;
  discount_amount?: number;
  payment_instructions?: string;
  admin_notes?: string;
  client_facing_notes?: string;
  line_items: NewLineItemInput[];
};

// Only a Draft with absolutely no payment/sending/activity history may
// ever be permanently deleted (brief: "Only allow permanent deletion of
// an invoice when it is still a Draft and has no payment, sending, or
// activity history.").
export function canPermanentlyDeleteInvoice(invoice: Pick<
  CrmInvoiceRow,
  "status" | "amount_paid" | "first_sent_at" | "last_sent_at" | "last_reminder_at"
>): boolean {
  return (
    invoice.status === "Draft" &&
    Number(invoice.amount_paid) === 0 &&
    !invoice.first_sent_at &&
    !invoice.last_sent_at &&
    !invoice.last_reminder_at
  );
}

// A Sent/Partially Paid invoice whose due date has passed reads as
// Overdue everywhere in the UI, without needing a cron job to flip the
// stored status column - Paid/Cancelled/Draft/Archived invoices are
// never considered overdue regardless of due date.
export function isInvoiceOverdue(invoice: Pick<CrmInvoiceRow, "status" | "due_date">): boolean {
  if (invoice.status !== "Sent" && invoice.status !== "Partially Paid") return false;
  if (!invoice.due_date) return false;
  return new Date(invoice.due_date + "T23:59:59").getTime() < Date.now();
}

export function effectiveInvoiceStatus(invoice: Pick<CrmInvoiceRow, "status" | "due_date">): InvoiceStatus {
  return isInvoiceOverdue(invoice) ? "Overdue" : invoice.status;
}

// Mirrors crm_invoice_line_items.line_total (a generated column:
// quantity * unit_price) so the create/update/send actions can validate
// a submitted line-item set before it ever reaches the database, rather
// than trusting whatever the client happened to send.
export function computeInvoiceSubtotal(items: { quantity: number; unit_price: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

// "Never generate a $0.00 invoice when valid line-item values were
// entered" - true only when the submitted line items genuinely sum to
// nothing (none saved, or every one is $0) and the invoice hasn't been
// deliberately marked free.
export function invoiceNeedsFreeConfirmation(items: { quantity: number; unit_price: number }[], isFreeInvoice: boolean): boolean {
  return !isFreeInvoice && computeInvoiceSubtotal(items) <= 0;
}
