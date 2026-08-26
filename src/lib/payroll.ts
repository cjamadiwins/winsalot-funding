// Shared, pure payroll math + formatting used by both the Winsalot Growth CRM
// (crm_payroll) and the Lead Generation CRM (leadgen_payroll). The two
// tables are entirely separate (separate agent pools, separate RLS - see
// the payroll migrations), but the payday schedule and NGN formatting are
// identical, so they live here once instead of being duplicated per CRM.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAY_PERIOD_DAYS = 14;

// Winsalot Corp pays agents biweekly, every second Friday. This is the
// last confirmed, already PAID payday - every other payday (past or
// future) is this date plus a whole number of 14-day increments.
// Changing this constant reschedules every future payday computed by
// this module. Schedule anchored so the next payday lands on Friday,
// August 21, 2026 (then Sep 4, Sep 18, Oct 2, ...).
export const PAYROLL_ANCHOR_PAYDAY = "2026-08-07";

// Draft: admin is still building the record, freely editable.
// Approved: admin has signed off on the payable-day count and amounts -
// still editable, but the UI requires a confirmation step to change it.
// Paid: locked at the database level (crm_payroll_prevent_paid_edit /
// leadgen_payroll_prevent_paid_edit triggers, migration 0063) - can only
// be changed by an explicit Reopen action, which takes it back to Draft.
// Cancelled: terminal, this pay period was voided and never paid out.
export type PayrollStatus = "draft" | "approved" | "paid" | "cancelled";

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  paid: "Paid",
  cancelled: "Cancelled",
};

// Winsalot Corp's standard biweekly pay structure (see AGENTS.md-adjacent
// payroll spec): every agent's base pay period is 10 working days at a
// flat daily rate derived from the biweekly base. These are the defaults
// written onto every new payroll record (crm_payroll.standard_biweekly_pay
// / standard_working_days, migration 0063) - stored per-record, not just
// read from here, so a future rate change never silently rewrites the
// daily rate on an already-created record.
export const STANDARD_BIWEEKLY_PAY = 75_000;
export const STANDARD_WORKING_DAYS = 10;
export const STANDARD_DAILY_RATE = STANDARD_BIWEEKLY_PAY / STANDARD_WORKING_DAYS;

// Hourly pay structure (see src/lib/attendance-pay.ts for the break/
// shortfall math this feeds): a completed 10-working-day, 75-paid-hour
// pay period earns exactly the ₦50,000 wage plus the fixed ₦25,000
// internet allowance, for a ₦75,000 total - "An agent completing all 75
// paid hours must receive exactly: Wages ₦50,000, Internet allowance
// ₦25,000, Total pay ₦75,000." Stored per-record (crm_payroll.standard_
// biweekly_wage / standard_paid_hours, migration 0075), not just read
// from here, for the same "a future rate change never silently rewrites
// an already-created record" reason as STANDARD_BIWEEKLY_PAY above.
export const STANDARD_BIWEEKLY_WAGE = 50_000;
export const STANDARD_PAID_HOURS = 75;
export const FIXED_INTERNET_ALLOWANCE = 25_000;
export const STANDARD_HOURLY_RATE = STANDARD_BIWEEKLY_WAGE / STANDARD_PAID_HOURS;

export function dailyRate(standardBiweeklyPay: number, standardWorkingDays: number): number {
  if (standardWorkingDays <= 0) return 0;
  return standardBiweeklyPay / standardWorkingDays;
}

// The internal hourly rate for a payroll record: standard biweekly wage
// ÷ standard paid hours (e.g. ₦50,000 ÷ 75 = ₦666.6667/hour). Deliberately
// not rounded - "Round only the final payroll amount, not each daily
// calculation" - only the final Naira totals this feeds into get rounded.
export function hourlyRate(standardBiweeklyWage: number, standardPaidHours: number): number {
  if (standardPaidHours <= 0) return 0;
  return standardBiweeklyWage / standardPaidHours;
}

// Gross wages before attendance deductions for a pay period: the full
// standard biweekly wage, prorated only if the agent's own schedule for
// the period covers fewer than the standard paid hours (e.g. a new hire
// starting mid-period). A full-schedule period simply earns the full
// ₦50,000 - every shortfall (absence, late arrival, early departure,
// excess break time) is captured by `deductions` instead, computed from
// attendance by aggregatePayPeriodHours (src/lib/attendance-pay.ts).
export function calculateGrossWageEarnings(
  standardBiweeklyWage: number,
  scheduledPaidHours: number,
  standardPaidHours: number
): number {
  if (standardPaidHours <= 0) return 0;
  const proration = Math.min(1, scheduledPaidHours / standardPaidHours);
  return Math.round(standardBiweeklyWage * proration * 100) / 100;
}

// Base Pay Earned = Payable Working Days x Daily Rate. Rounded to the
// nearest cent (Naira has 2 decimal places, same as every other amount
// column here) so this always matches what total_pay's generated column
// computes from the value this function's caller writes to the database.
export function calculateBasePayEarned(payableDays: number, standardBiweeklyPay: number, standardWorkingDays: number): number {
  const rate = dailyRate(standardBiweeklyPay, standardWorkingDays);
  return Math.round(payableDays * rate * 100) / 100;
}

// Final Pay = Base Pay Earned + Incentives + Other Additions - Deductions.
// Mirrors total_pay's generated-column expression exactly (base_pay_earned
// + internet_allowance + bonus_commission + other_additions - deductions -
// internet_allowance folds into "other additions" for display purposes but
// is kept as its own legacy column at the database level, see migration
// 0063's header comment) so a preview computed here before saving always
// matches what the database will actually store.
export function calculateFinalPay(parts: {
  basePayEarned: number;
  internetAllowance: number;
  incentiveBonus: number;
  otherAdditions: number;
  deductions: number;
}): number {
  const total =
    parts.basePayEarned + parts.internetAllowance + parts.incentiveBonus + parts.otherAdditions - parts.deductions;
  return Math.round(total * 100) / 100;
}

// The shape of a row in crm_payroll / leadgen_payroll - identical columns
// in both tables (see supabase/migrations/0054_crm_payroll.sql,
// 0055_leadgen_payroll.sql, and 0063_payroll_attendance_integration.sql).
export type PayrollRecord = {
  id: string;
  agent_id: string;
  pay_period_start: string;
  pay_period_end: string;
  payday: string;
  standard_biweekly_pay: number;
  standard_working_days: number;
  standard_biweekly_wage: number;
  standard_paid_hours: number;
  regular_paid_hours: number;
  unpaid_hours: number;
  approved_paid_leave_hours: number;
  days_present: number;
  approved_paid_days: number;
  unpaid_absence_days: number;
  total_payable_days: number;
  base_pay_earned: number;
  internet_allowance: number;
  bonus_commission: number;
  other_additions: number;
  deductions: number;
  total_pay: number;
  status: PayrollStatus;
  actual_payment_date: string | null;
  payment_method: string | null;
  admin_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  created_at: string;
  updated_at: string;
};

// One row of crm_payroll_audit_log / leadgen_payroll_audit_log.
export type PayrollAuditAction =
  | "created"
  | "attendance_loaded"
  | "days_adjusted"
  | "hours_adjusted"
  | "incentive_changed"
  | "deduction_changed"
  | "addition_changed"
  | "notes_updated"
  | "approved"
  | "marked_paid"
  | "cancelled"
  | "reopened";

export const PAYROLL_AUDIT_ACTION_LABELS: Record<PayrollAuditAction, string> = {
  created: "Payroll record created",
  attendance_loaded: "Attendance loaded",
  days_adjusted: "Payable days adjusted",
  hours_adjusted: "Paid/unpaid hours adjusted",
  incentive_changed: "Incentive/bonus changed",
  deduction_changed: "Deduction changed",
  addition_changed: "Other addition changed",
  notes_updated: "Notes updated",
  approved: "Payroll approved",
  marked_paid: "Marked as paid",
  cancelled: "Payroll cancelled",
  reopened: "Finalized payroll reopened",
};

export type PayrollAuditLogRow = {
  id: string;
  created_at: string;
  payroll_id: string;
  agent_id: string;
  action: PayrollAuditAction;
  performed_by: string | null;
  performed_by_name: string;
  reason: string | null;
  details: Record<string, unknown> | null;
};

// The subset of PayrollRecord that a create/update save can change and
// that the audit log cares about distinguishing ("Attendance adjusted" vs
// "Incentive added" vs "Deduction added", per the spec's audit log
// requirements). Used by buildPayrollAdjustmentAuditRows below.
export type PayrollAdjustableFields = Pick<
  PayrollRecord,
  | "days_present"
  | "approved_paid_days"
  | "unpaid_absence_days"
  | "total_payable_days"
  | "regular_paid_hours"
  | "unpaid_hours"
  | "approved_paid_leave_hours"
  | "bonus_commission"
  | "other_additions"
  | "internet_allowance"
  | "deductions"
  | "admin_notes"
>;

// Diffs an update's before/after values into one audit-log entry per
// distinct kind of change - a single Save can touch days, incentives,
// deductions, additions, and notes all at once, and each gets its own
// row so "what changed" is legible later without parsing a combined blob.
// Returns [] when nothing changed (e.g. a Save with no edits).
export function buildPayrollAdjustmentAuditRows(
  before: PayrollAdjustableFields,
  after: PayrollAdjustableFields
): { action: PayrollAuditAction; details: Record<string, unknown> }[] {
  const rows: { action: PayrollAuditAction; details: Record<string, unknown> }[] = [];

  if (
    before.days_present !== after.days_present ||
    before.approved_paid_days !== after.approved_paid_days ||
    before.unpaid_absence_days !== after.unpaid_absence_days ||
    before.total_payable_days !== after.total_payable_days
  ) {
    rows.push({
      action: "days_adjusted",
      details: {
        from: {
          days_present: before.days_present,
          approved_paid_days: before.approved_paid_days,
          unpaid_absence_days: before.unpaid_absence_days,
          total_payable_days: before.total_payable_days,
        },
        to: {
          days_present: after.days_present,
          approved_paid_days: after.approved_paid_days,
          unpaid_absence_days: after.unpaid_absence_days,
          total_payable_days: after.total_payable_days,
        },
      },
    });
  }

  if (
    before.regular_paid_hours !== after.regular_paid_hours ||
    before.unpaid_hours !== after.unpaid_hours ||
    before.approved_paid_leave_hours !== after.approved_paid_leave_hours
  ) {
    rows.push({
      action: "hours_adjusted",
      details: {
        from: {
          regular_paid_hours: before.regular_paid_hours,
          unpaid_hours: before.unpaid_hours,
          approved_paid_leave_hours: before.approved_paid_leave_hours,
        },
        to: {
          regular_paid_hours: after.regular_paid_hours,
          unpaid_hours: after.unpaid_hours,
          approved_paid_leave_hours: after.approved_paid_leave_hours,
        },
      },
    });
  }

  if (before.bonus_commission !== after.bonus_commission) {
    rows.push({
      action: "incentive_changed",
      details: { from: before.bonus_commission, to: after.bonus_commission },
    });
  }

  if (before.deductions !== after.deductions) {
    rows.push({ action: "deduction_changed", details: { from: before.deductions, to: after.deductions } });
  }

  if (before.other_additions !== after.other_additions || before.internet_allowance !== after.internet_allowance) {
    rows.push({
      action: "addition_changed",
      details: {
        from: { other_additions: before.other_additions, internet_allowance: before.internet_allowance },
        to: { other_additions: after.other_additions, internet_allowance: after.internet_allowance },
      },
    });
  }

  if (before.admin_notes !== after.admin_notes) {
    rows.push({ action: "notes_updated", details: { from: before.admin_notes, to: after.admin_notes } });
  }

  return rows;
}

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
// period ending on the Aug 7, 2026 payday is Jul 25 - Aug 7, 2026).
export function getPayPeriodForPayday(paydayIso: string): { start: string; end: string } {
  const payday = parseIsoDateUtc(paydayIso);
  const start = new Date(payday.getTime() - (PAY_PERIOD_DAYS - 1) * MS_PER_DAY);
  return { start: toIsoDate(start), end: paydayIso };
}

// "₦75,000" for whole amounts, "₦7,500.50" when there are cents - matches
// the payroll spec's own examples ("₦75,000 and ₦7,500"), which never show
// a trailing ".00".
export function formatNgn(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// "August 21, 2026"
export function formatDateLong(iso: string): string {
  return parseIsoDateUtc(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "Aug 21, 2026"
export function formatDateShort(iso: string): string {
  return parseIsoDateUtc(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "Aug 8 - Aug 21, 2026"
export function formatPayPeriodLabel(start: string, end: string): string {
  return `${formatDateShort(start)} - ${formatDateShort(end)}`;
}

// Every "YYYY-MM-DD" calendar date from start through end, inclusive.
// Weekend-ness is judged from the plain Y/M/D triple (local Date getDay()),
// which is timezone-independent for that purpose - a calendar date is a
// Saturday everywhere regardless of what timezone evaluates it.
export function datesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = parseIsoDateUtc(start);
  const endDate = parseIsoDateUtc(end);
  while (cursor.getTime() <= endDate.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  return dates;
}

function isWeekday(dateIso: string): boolean {
  const day = parseIsoDateUtc(dateIso).getUTCDay();
  return day !== 0 && day !== 6;
}

// The standard working days (Mon-Fri) within a pay period - always exactly
// 10 for a normal 14-day biweekly period (2 weeks x 5 weekdays), which is
// exactly the STANDARD_WORKING_DAYS constant. Weekends are excluded here,
// not deducted as absences later - "Do not automatically penalize an agent
// for weekends."
export function weekdaysInRange(start: string, end: string): string[] {
  return datesInRange(start, end).filter(isWeekday);
}
