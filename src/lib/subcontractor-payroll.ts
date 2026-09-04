// Subcontractor Payments: shared types, pure calculation logic, and
// currency formatting for the Subcontractors section of both CRMs'
// payroll admin areas (supabase/migrations/0135_subcontractor_payroll.sql).
// Entirely separate from src/lib/payroll.ts's employee/agent payroll -
// subcontractors are not crm_users/leadgen_users, have no attendance,
// approved-paid-day, or approved-leave rules, and are never mixed into
// crm_payroll/leadgen_payroll. Deliberately its own currency list (six
// currencies, not the four an agent's Payroll Currency supports - see
// PAYROLL_CURRENCIES in payroll.ts) so this feature can never accidentally
// narrow or widen what an *agent* is allowed to be paid in.

export const SUBCONTRACTOR_CURRENCIES = ["NGN", "PHP", "CAD", "USD", "GBP", "EUR"] as const;
export type SubcontractorCurrency = (typeof SUBCONTRACTOR_CURRENCIES)[number];

export const SUBCONTRACTOR_CURRENCY_LABELS: Record<SubcontractorCurrency, string> = {
  NGN: "NGN — Nigerian Naira",
  PHP: "PHP — Philippine Peso",
  CAD: "CAD — Canadian Dollar",
  USD: "USD — US Dollar",
  GBP: "GBP — British Pound",
  EUR: "EUR — Euro",
};

const SUBCONTRACTOR_CURRENCY_LOCALES: Record<SubcontractorCurrency, string> = {
  NGN: "en-NG",
  PHP: "en-PH",
  CAD: "en-CA",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
};

// "₦75,000" for whole amounts, cents shown only when present - same
// formatting convention as payroll.ts's formatCurrency, just over a wider
// currency list. No FX conversion: the number passed in is never altered,
// only its symbol/formatting changes per currency.
export function formatSubcontractorCurrency(amount: number, currency: SubcontractorCurrency): string {
  return new Intl.NumberFormat(SUBCONTRACTOR_CURRENCY_LOCALES[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Quantity-based pay types multiply an admin-entered, per-period quantity
// (approved hours/days/leads-or-appointments) by the subcontractor's rate.
// Flat pay types (fixed lump sum, or a recurring weekly/biweekly/monthly
// amount) have no quantity - the admin enters Gross Pay for that period
// directly instead.
export const SUBCONTRACTOR_PAY_TYPES = [
  "fixed",
  "hourly",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "per_lead_appointment",
] as const;
export type SubcontractorPayType = (typeof SUBCONTRACTOR_PAY_TYPES)[number];

export const SUBCONTRACTOR_PAY_TYPE_LABELS: Record<SubcontractorPayType, string> = {
  fixed: "Fixed Amount",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  per_lead_appointment: "Per Lead / Appointment",
};

const QUANTITY_BASED_PAY_TYPES: readonly SubcontractorPayType[] = ["hourly", "daily", "per_lead_appointment"];

export function isQuantityBasedPayType(payType: SubcontractorPayType): boolean {
  return QUANTITY_BASED_PAY_TYPES.includes(payType);
}

// "Approved Hours" / "Approved Days" / "Approved Leads / Appointments" -
// the label for the quantity input, specific to each quantity-based pay
// type. Only meaningful when isQuantityBasedPayType(payType) is true.
export const SUBCONTRACTOR_QUANTITY_LABELS: Partial<Record<SubcontractorPayType, string>> = {
  hourly: "Approved Hours",
  daily: "Approved Days",
  per_lead_appointment: "Approved Leads / Appointments",
};

// Quantity x Rate = Gross Pay for a quantity-based pay type - "requirement
// 8" in the brief. Rounded to the nearest cent, same convention as every
// other money calculation in this codebase (see payroll.ts's header
// comments on rounding only the final amount).
export function calculateSubcontractorGrossPay(
  payType: SubcontractorPayType,
  quantity: number | null,
  rate: number
): number {
  if (!isQuantityBasedPayType(payType)) return 0;
  return Math.round(Math.max(0, quantity ?? 0) * Math.max(0, rate) * 100) / 100;
}

// Net Pay = Gross Pay + Adjustments - Deductions. Mirrors
// crm_subcontractor_payments.net_pay's generated-column expression exactly
// so a preview computed here before saving always matches what the
// database will actually store (same "let the database compute it once,
// preview matches" rationale as calculateFinalPay in payroll.ts).
export function calculateSubcontractorNetPay(parts: { grossPay: number; adjustments: number; deductions: number }): number {
  const total = parts.grossPay + parts.adjustments - parts.deductions;
  return Math.round(total * 100) / 100;
}

export type SubcontractorPaymentStatus = "pending" | "approved" | "paid";

export const SUBCONTRACTOR_PAYMENT_STATUS_LABELS: Record<SubcontractorPaymentStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  paid: "Paid",
};

// The shape of a row in crm_subcontractors / leadgen_subcontractors -
// identical columns in both tables.
export type SubcontractorRow = {
  id: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  auth_user_id: string | null;
  portal_active: boolean;
  invited_at: string | null;
  last_login_at: string | null;
  business_client_id: string | null;
  country: string | null;
  currency: SubcontractorCurrency;
  pay_type: SubcontractorPayType;
  pay_rate: number;
  notes: string | null;
  active: boolean;
  deactivated_at: string | null;
};

export type SubcontractorAgreementStatus = "sent" | "signed" | "superseded";

export type SubcontractorAgreementRow = {
  id: string;
  created_at: string;
  subcontractor_id: string;
  version: number;
  status: SubcontractorAgreementStatus;
  agreement_text: string;
  currency: SubcontractorCurrency;
  pay_type: SubcontractorPayType;
  pay_rate: number;
  issued_at: string;
  opened_at: string | null;
  accepted_at: string | null;
  signer_full_name: string | null;
  signer_signature_text: string | null;
  accepted_by_auth_user: string | null;
};

// The shape of a row in crm_subcontractor_payments / leadgen_subcontractor_payments.
export type SubcontractorPaymentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  subcontractor_id: string;
  period_start: string;
  period_end: string;
  quantity: number | null;
  gross_pay: number;
  adjustments: number;
  deductions: number;
  net_pay: number;
  status: SubcontractorPaymentStatus;
  payment_date: string | null;
  notes: string | null;
};

// A minimal client/business record, structurally common to both
// crm_clients (Growth CRM) and leadgen_clients (Lead Gen CRM) - just
// enough to populate the optional Business/Client dropdown without either
// CRM's subcontractor UI needing to import the other CRM's client types.
export type SubcontractorBusinessClientOption = {
  id: string;
  name: string;
};

// Sums a set of subcontractor payments' net_pay, grouped by the owning
// subcontractor's currency - never summed across currencies (no FX
// conversion anywhere in this feature). Used to build the Subcontractor
// Payments side of the Payroll Cost Summary.
export function sumSubcontractorPaymentsByCurrency(
  payments: SubcontractorPaymentRow[],
  subcontractorsById: Map<string, SubcontractorRow>
): Partial<Record<SubcontractorCurrency, number>> {
  const totals: Partial<Record<SubcontractorCurrency, number>> = {};
  for (const payment of payments) {
    const subcontractor = subcontractorsById.get(payment.subcontractor_id);
    if (!subcontractor) continue;
    const currency = subcontractor.currency;
    totals[currency] = Math.round(((totals[currency] ?? 0) + payment.net_pay) * 100) / 100;
  }
  return totals;
}
