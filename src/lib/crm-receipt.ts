import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmPaymentRow } from "./crm-clients-types";
import { formatCurrency } from "./crm-clients-types";

// Client-facing receipt data for one crm_payments row. Deliberately built
// from client-safe fields only - internal notes, recorded_by and reversal
// details never appear on a receipt (or in the client portal).
export type ReceiptData = {
  paymentId: string;
  receiptNumber: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  amount: number;
  currency: string;
  amountLabel: string;
  paymentDate: string;
  description: string;
  paymentTypeLabel: string;
  paymentMethodLabel: string | null;
  agreementNumber: string | null;
  status: "PAID" | "REVERSED";
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  initial_campaign_deposit: "Initial campaign deposit",
};

const METHOD_LABELS: Record<string, string> = {
  e_transfer: "Interac e-Transfer",
  credit_card: "Credit Card",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export function formatReceiptDate(value: string): string {
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Column list used by every receipt/portal query so nothing internal is fetched.
export const RECEIPT_PAYMENT_COLUMNS =
  "id, client_id, invoice_id, agreement_id, payment_date, amount, currency, payment_method, payment_type, description, receipt_number, reversed_at, receipt_email_count, receipt_last_emailed_at";

type ReceiptPaymentRow = Pick<
  CrmPaymentRow,
  "id" | "client_id" | "agreement_id" | "payment_date" | "amount" | "currency" | "payment_method" | "payment_type" | "description" | "receipt_number" | "reversed_at"
>;

export async function buildReceiptData(supabase: SupabaseClient, payment: ReceiptPaymentRow): Promise<ReceiptData | null> {
  if (!payment.receipt_number) return null;
  const [{ data: client }, { data: agreement }] = await Promise.all([
    supabase.from("crm_clients").select("company_name, primary_contact_name, email").eq("id", payment.client_id).maybeSingle(),
    payment.agreement_id
      ? supabase.from("crm_client_agreements").select("agreement_number").eq("id", payment.agreement_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!client) return null;
  return {
    paymentId: payment.id,
    receiptNumber: payment.receipt_number,
    businessName: client.company_name,
    contactName: client.primary_contact_name,
    email: client.email,
    amount: Number(payment.amount),
    currency: payment.currency,
    amountLabel: `${formatCurrency(payment.amount, payment.currency)} ${payment.currency}`,
    paymentDate: payment.payment_date,
    description: payment.description || "Payment received",
    paymentTypeLabel: payment.payment_type ? PAYMENT_TYPE_LABELS[payment.payment_type] ?? payment.payment_type : "Payment",
    paymentMethodLabel: payment.payment_method ? METHOD_LABELS[payment.payment_method] : null,
    agreementNumber: (agreement as { agreement_number: string } | null)?.agreement_number ?? null,
    status: payment.reversed_at ? "REVERSED" : "PAID",
  };
}

export async function loadReceiptByPaymentId(supabase: SupabaseClient, paymentId: string): Promise<ReceiptData | null> {
  const { data: payment } = await supabase.from("crm_payments").select(RECEIPT_PAYMENT_COLUMNS).eq("id", paymentId).maybeSingle();
  if (!payment) return null;
  return buildReceiptData(supabase, payment as unknown as ReceiptPaymentRow);
}

export function receiptFilename(receipt: Pick<ReceiptData, "receiptNumber">): string {
  return `Winsalot-Receipt-${receipt.receiptNumber}.pdf`;
}
