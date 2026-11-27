// Sales Conversion Bonus - client-safe types, labels and totals. No
// "server-only"/Supabase imports so both CRMs' client components can use it.
// The rules themselves (CA$50, who may confirm/approve, duplicate protection,
// never-auto-paid) are enforced by the database functions in
// supabase/migrations/20261029000000_sales_conversion_bonuses.sql; this file
// only describes and summarizes what those functions store.

export const SALES_BONUS_CURRENCY = "CAD";

export const SALES_BONUS_FUNDING_MODELS = ["client_funded", "winsalot_funded"] as const;
export type SalesBonusFundingModel = (typeof SALES_BONUS_FUNDING_MODELS)[number];

export const SALES_BONUS_FUNDING_LABELS: Record<SalesBonusFundingModel, string> = {
  client_funded: "Client funded (receivable)",
  winsalot_funded: "Winsalot funded (bonus expense)",
};

export const SALES_BONUS_AGENT_STATUSES = ["pending", "approved", "paid", "voided"] as const;
export type SalesBonusAgentStatus = (typeof SALES_BONUS_AGENT_STATUSES)[number];

export const SALES_BONUS_AGENT_STATUS_LABELS: Record<SalesBonusAgentStatus, string> = {
  pending: "Pending approval",
  approved: "Approved - awaiting payment",
  paid: "Paid",
  voided: "Voided",
};

export const SALES_BONUS_AGENT_STATUS_STYLES: Record<SalesBonusAgentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  voided: "bg-slate-200 text-slate-600",
};

export const SALES_BONUS_CLIENT_STATUSES = ["not_applicable", "receivable", "received"] as const;
export type SalesBonusClientStatus = (typeof SALES_BONUS_CLIENT_STATUSES)[number];

export const SALES_BONUS_CLIENT_STATUS_LABELS: Record<SalesBonusClientStatus, string> = {
  not_applicable: "No client leg",
  receivable: "Client receivable outstanding",
  received: "Received from client",
};

export const SALES_BONUS_CLIENT_STATUS_STYLES: Record<SalesBonusClientStatus, string> = {
  not_applicable: "bg-slate-100 text-slate-500",
  receivable: "bg-amber-100 text-amber-800",
  received: "bg-emerald-100 text-emerald-800",
};

export type SalesBonusRow = {
  id: string;
  created_at: string;
  appointment_id: string | null;
  lead_id: string | null;
  client_id: string;
  agent_id: string | null;
  agent_name: string;
  agent_email: string;
  client_name: string;
  business_name: string;
  appointment_date: string | null;
  funding_model: SalesBonusFundingModel;
  accounting_treatment: "client_receivable" | "winsalot_bonus_expense";
  bonus_amount: number | string;
  currency: string;
  sale_confirmed_by_name: string;
  sale_confirmed_at: string;
  sale_notes: string | null;
  client_payment_status: SalesBonusClientStatus;
  client_payment_date: string | null;
  client_payment_reference: string | null;
  agent_payment_status: SalesBonusAgentStatus;
  approved_by_name: string | null;
  approved_at: string | null;
  payroll_payday: string | null;
  paid_by_name: string | null;
  paid_at: string | null;
  payment_date: string | null;
  payment_reference: string | null;
  void_reason: string | null;
};

// What an agent is allowed to see (winsalot_my_sales_bonuses()): no client
// billing, funding model, accounting treatment or admin notes.
export type AgentSalesBonusRow = Pick<
  SalesBonusRow,
  "id" | "sale_confirmed_at" | "business_name" | "client_name" | "appointment_date" | "bonus_amount" | "currency" | "agent_payment_status" | "payroll_payday" | "payment_date" | "payment_reference"
>;

export type SalesBonusProgramRow = {
  id: string;
  client_id: string;
  funding_model: SalesBonusFundingModel;
  bonus_amount: number | string;
  currency: string;
  active: boolean;
};

export function formatBonusAmount(amount: number | string, currency: string = SALES_BONUS_CURRENCY): string {
  const value = Number(amount);
  const prefix = currency === "CAD" ? "CA$" : `${currency} `;
  return `${prefix}${value.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type SalesBonusTotals = {
  pending: number;
  approved: number;
  paid: number;
  // Teknokraft leg: what clients still owe Winsalot / have paid it.
  clientReceivableOutstanding: number;
  clientReceived: number;
  // Hidebrandt-style bonuses Winsalot funds itself (approved + paid only -
  // a pending bonus is not yet a committed expense).
  winsalotBonusExpense: number;
};

// Totals are kept in integer cents and only ever summed within a currency
// (the program is CAD-only today; the key stays so a second currency could
// never be silently blended in). Voided rows count toward nothing.
export function summarizeSalesBonuses(rows: Pick<SalesBonusRow, "bonus_amount" | "currency" | "agent_payment_status" | "client_payment_status" | "accounting_treatment">[]): Record<string, SalesBonusTotals> {
  const cents: Record<string, SalesBonusTotals> = {};
  for (const row of rows) {
    if (row.agent_payment_status === "voided") continue;
    const t = (cents[row.currency] ??= { pending: 0, approved: 0, paid: 0, clientReceivableOutstanding: 0, clientReceived: 0, winsalotBonusExpense: 0 });
    const amount = Math.round(Number(row.bonus_amount) * 100);
    t[row.agent_payment_status] += amount;
    if (row.client_payment_status === "receivable") t.clientReceivableOutstanding += amount;
    if (row.client_payment_status === "received") t.clientReceived += amount;
    if (row.accounting_treatment === "winsalot_bonus_expense" && row.agent_payment_status !== "pending") t.winsalotBonusExpense += amount;
  }
  return Object.fromEntries(
    Object.entries(cents).map(([currency, t]) => [
      currency,
      Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / 100])) as SalesBonusTotals,
    ])
  );
}

// Payroll cost of bonuses Winsalot has committed to or paid out (approved +
// paid), per currency - feeds the Payroll Cost Summary. Pending is a
// forecast, not yet a cost.
export function salesBonusPayrollCost(rows: Pick<SalesBonusRow, "bonus_amount" | "currency" | "agent_payment_status">[]): Record<string, number> {
  const cents: Record<string, number> = {};
  for (const row of rows) {
    if (row.agent_payment_status !== "approved" && row.agent_payment_status !== "paid") continue;
    cents[row.currency] = (cents[row.currency] ?? 0) + Math.round(Number(row.bonus_amount) * 100);
  }
  return Object.fromEntries(Object.entries(cents).map(([c, v]) => [c, v / 100]));
}

// Statuses the database refuses to confirm as a sale (kept in step with
// winsalot_confirm_sales_conversion).
export const SALES_BONUS_INELIGIBLE_APPOINTMENT_STATUSES = ["Cancelled", "Replaced", "No-show"] as const;

export type ConfirmableAppointment = {
  id: string;
  client_id: string;
  lead_id: string | null;
  status: string;
  booking_agent_id: string | null;
};

export type SaleConfirmationState =
  | { kind: "no_program" } // client has no bonus program
  | { kind: "ineligible"; reason: string }
  | { kind: "confirmed"; bonus: Pick<SalesBonusRow, "id" | "agent_payment_status"> }
  | { kind: "confirmable" };

// UI-side mirror of the database checks, used only to decide which controls
// to show; the database function remains the authority (and is what stops a
// stale page or forged request from creating a second bonus).
export function saleConfirmationState(
  appointment: ConfirmableAppointment,
  programClientIds: ReadonlySet<string>,
  bonuses: Pick<SalesBonusRow, "id" | "appointment_id" | "lead_id" | "agent_payment_status">[]
): SaleConfirmationState {
  if (!programClientIds.has(appointment.client_id)) return { kind: "no_program" };
  const live = bonuses.find(
    (b) => b.agent_payment_status !== "voided" && (b.appointment_id === appointment.id || (appointment.lead_id !== null && b.lead_id === appointment.lead_id))
  );
  if (live) return { kind: "confirmed", bonus: { id: live.id, agent_payment_status: live.agent_payment_status } };
  if ((SALES_BONUS_INELIGIBLE_APPOINTMENT_STATUSES as readonly string[]).includes(appointment.status)) {
    return { kind: "ineligible", reason: `${appointment.status} appointments cannot be confirmed as a sale.` };
  }
  if (!appointment.booking_agent_id) return { kind: "ineligible", reason: "No credited agent on this appointment." };
  return { kind: "confirmable" };
}
