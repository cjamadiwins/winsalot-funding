import type { SupabaseClient } from "@supabase/supabase-js";
import type { HolidayPaymentType } from "./holiday-pay";

// Approved paid holidays that land in a given payroll, read by the agent's
// stable user id. An assignment belongs to a crm_users OR leadgen_users row,
// but people who work in both CRMs share one id across the two tables, so
// matching either column finds the assignment whichever CRM recorded it
// (matching only one CRM's column is the same trap that zeroed attendance).
// Same predicate as loadHolidayPaySummaryAction: assigned, holiday not
// deleted, holiday's payroll_period_payday = this payday.

export type PaidHolidayForPayroll = {
  name: string;
  date: string; // YYYY-MM-DD
  paymentType: HolidayPaymentType;
  effectiveAmount: number;
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// PostgREST `or` filter matching either CRM's user column; null for an id
// that could not be embedded safely (callers treat that as "no match").
export function holidayAssignmentOwnerFilter(agentId: string): string | null {
  return SAFE_ID.test(agentId) ? `crm_user_id.eq.${agentId},leadgen_user_id.eq.${agentId}` : null;
}

type Row = { effective_amount: number | null; holidays: { name: string; holiday_date: string; payment_type: HolidayPaymentType } | null };

export async function loadPaidHolidaysForPayroll(
  db: Pick<SupabaseClient, "from">,
  agentId: string,
  payday: string
): Promise<{ error?: string; holidays?: PaidHolidayForPayroll[] }> {
  const owner = holidayAssignmentOwnerFilter(agentId);
  if (!owner) return { holidays: [] };
  const { data, error } = await db
    .from("holiday_pay_assignments")
    .select("effective_amount, holidays!inner(name, holiday_date, payment_type, payroll_period_payday, deleted_at)")
    .or(owner)
    .eq("status", "assigned")
    .eq("holidays.payroll_period_payday", payday)
    .is("holidays.deleted_at", null);
  if (error) return { error: `Failed to load holiday pay: ${error.message}` };
  const holidays = ((data ?? []) as unknown as Row[])
    .filter((r): r is Row & { holidays: NonNullable<Row["holidays"]> } => Boolean(r.holidays))
    .map((r) => ({ name: r.holidays.name, date: r.holidays.holiday_date, paymentType: r.holidays.payment_type, effectiveAmount: Number(r.effective_amount ?? 0) }));
  return { holidays };
}

// A holiday counts as a paid day off only if it actually pays something.
export function isPaidHoliday(h: Pick<PaidHolidayForPayroll, "paymentType" | "effectiveAmount">): boolean {
  return h.paymentType !== "unpaid" && h.effectiveAmount > 0;
}

export function paidHolidayDates(holidays: PaidHolidayForPayroll[], periodStart: string, periodEnd: string): string[] {
  return holidays
    .filter((h) => isPaidHoliday(h) && h.date >= periodStart && h.date <= periodEnd)
    .map((h) => h.date)
    .sort();
}
