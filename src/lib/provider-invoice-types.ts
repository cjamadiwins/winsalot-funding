// Provider Invoices & Payments: lets an administrator invoice a provider
// (e.g. referral/lead fees, platform charges) and record payments received
// from that provider, inside the existing operational Provider Profile
// (cleaning_providers). See supabase/migrations/0029_provider_invoices.sql.
// Admin-only end to end - never surfaced to agents or the public
// quote-submission flow (see lib/crm-auth.ts's requireCrmAdmin()).

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

// Green for Paid, yellow for Partially Paid, red for Overdue, grey for
// Draft/Cancelled (brief section 6) - "Sent" gets its own neutral blue so
// it's visually distinct from an untouched Draft.
export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-slate-200 text-slate-600",
  sent: "bg-sky-100 text-sky-800",
  partially_paid: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  overdue: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-200 text-slate-600",
};

export const PAYMENT_METHODS = [
  "e_transfer",
  "credit_card",
  "bank_transfer",
  "cash",
  "cheque",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  e_transfer: "E-transfer",
  credit_card: "Credit Card",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export type ProviderInvoiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  cleaning_provider_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  description: string | null;
  status: InvoiceStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance: number;
  internal_notes: string | null;
  payment_instructions: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
};

export type ProviderInvoiceLineItemRow = {
  id: string;
  created_at: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
};

export type ProviderPaymentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  invoice_id: string;
  cleaning_provider_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_by_name: string;
  attachment_path: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
};

export type ProviderPaymentAdjustmentRow = {
  id: string;
  created_at: string;
  payment_id: string;
  invoice_id: string;
  adjustment_type: "correction" | "reversal";
  reason: string;
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  performed_by: string | null;
  performed_by_name: string;
};

export type ProviderInvoiceWithRelations = ProviderInvoiceRow & {
  lineItems: ProviderInvoiceLineItemRow[];
  payments: ProviderPaymentRow[];
};

export type ProviderFinancialSummary = {
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  overdueBalance: number;
  unpaidInvoiceCount: number;
  lastPaymentDate: string | null;
};

// Canadian currency formatting per the brief, e.g. "CA$499.00".
export function formatCad(amount: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
}

export function formatInvoiceDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
