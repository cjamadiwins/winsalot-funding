// Shared, pure payroll math + formatting used by both the Cleaning CRM
// (crm_payroll) and the Lead Generation CRM (leadgen_payroll). The two
// tables are entirely separate (separate agent pools, separate RLS - see
// the payroll migrations), but the payday schedule and NGN formatting are
// identical, so they live here once instead of being duplicated per CRM.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAY_PERIOD_DAYS = 14;

// Winsalot Corp pays agents biweekly. This is the last confirmed, already
// PAID payday - every other payday (past or future) is this date plus a
// whole number of 14-day increments. Changing this constant reschedules
// every future payday computed by this module.
export const PAYROLL_ANCHOR_PAYDAY = "2026-08-06";

export type PayrollStatus = "pending" | "paid";

// The shape of a row in crm_payroll / leadgen_payroll - identical columns
// in both tables (see supabase/migrations/0054_crm_payroll.sql and
// 0055_leadgen_payroll.sql).
export type PayrollRecord = {
  id: string;
  agent_id: string;
  pay_period_start: string;
  pay_period_end: string;
  payday: string;
  base_salary: number;
  internet_allowance: number;
  bonus_commission: number;
  deductions: number;
  total_pay: number;
  status: PayrollStatus;
  actual_payment_date: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

function parseIsoDateUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// How many whole 14-day periods `date` is past the anchor, rounded up -
// e.g. exactly on the anchor is period 0, one day after is period 1.
function periodsSinceAnchor(date: Date): number {
  const anchor = parseIsoDateUtc(PAYROLL_ANCHOR_PAYDAY);
  const diffDays = Math.round((date.getTime() - anchor.getTime()) / MS_PER_DAY);
  return Math.ceil(diffDays / PAY_PERIOD_DAYS);
}

function paydayForPeriodIndex(index: number): Date {
  const anchor = parseIsoDateUtc(PAYROLL_ANCHOR_PAYDAY);
  return new Date(anchor.getTime() + index * PAY_PERIOD_DAYS * MS_PER_DAY);
}

// The next payday on or after `from` (defaults to today). The anchor date
// itself is always excluded - it's already paid - so this never returns a
// date at or before the anchor.
export function getNextPayday(from: Date = new Date()): string {
  const fromUtc = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const index = Math.max(1, periodsSinceAnchor(fromUtc));
  return toIsoDate(paydayForPeriodIndex(index));
}

// `count` consecutive paydays starting from the next one on/after `from`.
export function getUpcomingPaydays(count: number, from: Date = new Date()): string[] {
  const fromUtc = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const startIndex = Math.max(1, periodsSinceAnchor(fromUtc));
  return Array.from({ length: count }, (_, i) => toIsoDate(paydayForPeriodIndex(startIndex + i)));
}

// The 14-day pay period a given payday closes out: 13 days before the
// payday through the payday itself, inclusive (matches the anchor: the
// period ending on the Aug 6, 2026 payday is Jul 24 - Aug 6, 2026).
export function getPayPeriodForPayday(paydayIso: string): { start: string; end: string } {
  const payday = parseIsoDateUtc(paydayIso);
  const start = new Date(payday.getTime() - (PAY_PERIOD_DAYS - 1) * MS_PER_DAY);
  return { start: toIsoDate(start), end: paydayIso };
}

export function formatNgn(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
}

// "August 20, 2026"
export function formatDateLong(iso: string): string {
  return parseIsoDateUtc(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "Aug 20, 2026"
export function formatDateShort(iso: string): string {
  return parseIsoDateUtc(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "Aug 7 - Aug 20, 2026"
export function formatPayPeriodLabel(start: string, end: string): string {
  return `${formatDateShort(start)} - ${formatDateShort(end)}`;
}
