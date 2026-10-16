// Single, shared pay-period attendance analysis used by BOTH CRMs' payroll
// ("Refresh Attendance"). Pure and framework-agnostic: the Growth CRM
// (agent_attendance) and Lead Generation CRM (leadgen_agent_attendance) feed
// it rows and get identical numbers back, so the two can never disagree.
//
// Rules this module enforces on top of attendance-pay.ts's per-shift math:
//  - Rows from both CRM attendance tables are merged by the stable agent id;
//    the same clock-in recorded in both tables is counted once.
//  - A completed shift longer than MAX_PLAUSIBLE_SHIFT_MINUTES (a forgotten
//    clock-out, an overnight or multi-day record) is NEVER counted as worked
//    time automatically. It is flagged for admin review, and the weekdays it
//    covers are reported as "needs review" instead of present or missed.
//  - Paid minutes are capped at the 450-minute schedule per weekday, and the
//    shortfall is computed per day, so a duplicate or split day can neither
//    double-pay nor double-deduct.
// Nothing here writes to, or alters, any attendance record.

import {
  computeShiftPayBreakdown,
  FULL_DAY_SHORTFALL_MINUTES,
  SCHEDULED_PAID_MINUTES_PER_SHIFT,
  type AttendanceBreakFields,
} from "./attendance-pay";

// A scheduled shift is 8 hours. Anything past 12 hours is not a plausible
// single shift and is treated as an irregular record.
export const MAX_PLAUSIBLE_SHIFT_MINUTES = 12 * 60;
// The same clock-in written to both CRM tables lands within seconds of itself.
export const DUPLICATE_CLOCK_IN_WINDOW_MS = 5 * 60 * 1000;
// How far before the pay period to look for a long record that runs into it.
export const SPAN_LOOKBACK_DAYS = 7;

export type PayrollShiftRow = AttendanceBreakFields & {
  id: string;
  agent_id: string;
  total_minutes: number | null;
};

export type AttendanceSource = "growth" | "leadgen";
export type SourcedShiftRow = PayrollShiftRow & { source?: AttendanceSource };

export type IrregularReason = "exceeds_max_shift" | "spans_multiple_days" | "invalid_times";

export const IRREGULAR_REASON_LABELS: Record<IrregularReason, string> = {
  exceeds_max_shift: "longer than a plausible single shift (likely a missed clock-out)",
  spans_multiple_days: "runs across more than one calendar day",
  invalid_times: "clock-out is not after clock-in",
};

function elapsedMinutes(row: Pick<PayrollShiftRow, "clock_in" | "clock_out">): number | null {
  if (!row.clock_out) return null;
  return (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 60000;
}

export function irregularShiftReasons(row: PayrollShiftRow, dateKey: (iso: string) => string): IrregularReason[] {
  const elapsed = elapsedMinutes(row);
  if (elapsed === null) return [];
  if (elapsed <= 0) return ["invalid_times"];
  if (elapsed <= MAX_PLAUSIBLE_SHIFT_MINUTES) return [];
  const reasons: IrregularReason[] = ["exceeds_max_shift"];
  if (dateKey(row.clock_in) !== dateKey(row.clock_out!)) reasons.push("spans_multiple_days");
  return reasons;
}

export type MergeResult<T> = { rows: T[]; duplicatesRemoved: { keptId: string; droppedId: string; droppedSource: AttendanceSource | undefined }[] };

// Merges attendance from several CRM tables for ONE employee id. A clock-in
// recorded in two tables within DUPLICATE_CLOCK_IN_WINDOW_MS is the same
// shift: the completed / longer copy is kept (earlier source wins a tie).
export function mergeAttendanceSources<T extends SourcedShiftRow>(groups: { source: AttendanceSource; rows: Omit<T, "source">[] }[]): MergeResult<T> {
  const all = groups.flatMap((g, order) => g.rows.map((r) => ({ row: { ...r, source: g.source } as T, order })));
  all.sort((a, b) => new Date(a.row.clock_in).getTime() - new Date(b.row.clock_in).getTime() || a.order - b.order);

  const kept: { row: T; order: number }[] = [];
  const duplicatesRemoved: MergeResult<T>["duplicatesRemoved"] = [];
  for (const candidate of all) {
    const match = kept.find(
      (k) =>
        k.row.agent_id === candidate.row.agent_id &&
        Math.abs(new Date(k.row.clock_in).getTime() - new Date(candidate.row.clock_in).getTime()) <= DUPLICATE_CLOCK_IN_WINDOW_MS
    );
    if (!match) {
      kept.push(candidate);
      continue;
    }
    const better =
      (!match.row.clock_out && candidate.row.clock_out) ||
      (Boolean(match.row.clock_out) === Boolean(candidate.row.clock_out) && (candidate.row.total_minutes ?? 0) > (match.row.total_minutes ?? 0));
    if (better) {
      duplicatesRemoved.push({ keptId: candidate.row.id, droppedId: match.row.id, droppedSource: match.row.source });
      match.row = candidate.row;
    } else {
      duplicatesRemoved.push({ keptId: match.row.id, droppedId: candidate.row.id, droppedSource: candidate.row.source });
    }
  }
  return { rows: kept.map((k) => k.row), duplicatesRemoved };
}

// Provenance shown beside the numbers so admins can see attendance came from
// both CRM tables and how many same-shift copies were collapsed.
export type PayrollAttendanceSourceInfo = { growthRows: number; leadgenRows: number; duplicatesRemoved: number };

export type FlaggedShift = {
  id: string;
  source?: AttendanceSource;
  dateKey: string; // calendar day of the clock-in
  clockIn: string;
  clockOut: string;
  clockOutDateKey: string; // calendar day of the clock-out
  elapsedMinutes: number;
  reasons: IrregularReason[];
  // The most a single shift could ever be paid if an admin confirms it
  // (the 450-minute schedule) - never the elapsed time.
  maxPayableMinutesIfConfirmed: number;
  coveredWeekdays: string[]; // weekdays inside the pay period this record runs across
};

export type PayrollDayStatus = "Clocked In" | "Clocked Out" | "Incomplete" | "Admin Clock-Out";

export type PayPeriodAnalysis = {
  periodStart: string;
  periodEnd: string;
  weekdayCount: number;
  days: { dateKey: string; isWeekday: boolean; status: PayrollDayStatus | null; minutes: number }[];
  daysPresent: number; // weekdays with at least one verified, completed shift
  missedDates: string[]; // weekdays with no attendance at all (and not covered by a flagged record)
  reviewDates: string[]; // weekdays only evidenced by a flagged record, or covered by one
  flaggedDates: string[]; // clock-in with no clock-out on an earlier day
  openTodayDate: string | null;
  regularPaidMinutes: number;
  unpaidMinutes: number;
  flaggedShifts: FlaggedShift[];
};

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const date = parseKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return formatKey(date);
}

function isWeekdayKey(key: string): boolean {
  const dow = parseKey(key).getUTCDay();
  return dow !== 0 && dow !== 6;
}

export function analyzePayPeriod(
  rows: SourcedShiftRow[],
  periodStart: string,
  periodEnd: string,
  todayKey: string,
  scheduledStartTime: string | null,
  dateKey: (iso: string) => string
): PayPeriodAnalysis {
  // Calendar days each flagged record runs across (after its own clock-in day).
  const flaggedShifts: FlaggedShift[] = [];
  const coveredByFlagged = new Set<string>();
  for (const row of rows) {
    const reasons = irregularShiftReasons(row, dateKey);
    if (reasons.length === 0) continue;
    const startKey = dateKey(row.clock_in);
    const endKey = dateKey(row.clock_out!);
    const covered: string[] = [];
    for (let key = addDaysKey(startKey, 1); key <= endKey; key = addDaysKey(key, 1)) {
      if (isWeekdayKey(key)) {
        covered.push(key);
        coveredByFlagged.add(key);
      }
    }
    const ownDayInPeriod = startKey >= periodStart && startKey <= periodEnd && isWeekdayKey(startKey);
    const coveredInPeriod = covered.filter((k) => k >= periodStart && k <= periodEnd);
    if (!ownDayInPeriod && coveredInPeriod.length === 0) continue;
    flaggedShifts.push({
      id: row.id,
      source: row.source,
      dateKey: startKey,
      clockIn: row.clock_in,
      clockOut: row.clock_out!,
      clockOutDateKey: endKey,
      elapsedMinutes: Math.round(elapsedMinutes(row)!),
      reasons,
      maxPayableMinutesIfConfirmed: SCHEDULED_PAID_MINUTES_PER_SHIFT,
      coveredWeekdays: coveredInPeriod,
    });
  }
  const flaggedIds = new Set(flaggedShifts.map((f) => f.id));
  const isFlagged = (row: PayrollShiftRow) => irregularShiftReasons(row, dateKey).length > 0;

  const days: PayPeriodAnalysis["days"] = [];
  const missedDates: string[] = [];
  const reviewDates: string[] = [];
  const flaggedDates: string[] = [];
  let openTodayDate: string | null = null;
  let daysPresent = 0;
  let weekdayCount = 0;
  let regularPaidMinutes = 0;
  let unpaidMinutes = 0;

  for (let key = periodStart; key <= periodEnd; key = addDaysKey(key, 1)) {
    const weekday = isWeekdayKey(key);
    if (!weekday) {
      days.push({ dateKey: key, isWeekday: false, status: null, minutes: 0 });
      continue;
    }
    weekdayCount++;

    const sessions = rows
      .filter((r) => dateKey(r.clock_in) === key)
      .sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());

    if (sessions.length === 0) {
      if (coveredByFlagged.has(key)) reviewDates.push(key);
      else {
        missedDates.push(key);
        unpaidMinutes += FULL_DAY_SHORTFALL_MINUTES;
      }
      days.push({ dateKey: key, isWeekday: true, status: null, minutes: 0 });
      continue;
    }

    const open = sessions.find((r) => !r.clock_out);
    let openStatus: PayrollDayStatus | null = null;
    if (open) {
      if (dateKey(open.clock_in) === todayKey) {
        openTodayDate = key;
        openStatus = "Clocked In";
      } else {
        flaggedDates.push(key);
        openStatus = "Incomplete";
      }
    }

    const completed = sessions.filter((r) => r.clock_out);
    const verified = completed.filter((r) => !isFlagged(r));
    if (verified.length === 0) {
      const hasFlagged = completed.some((r) => flaggedIds.has(r.id) || isFlagged(r));
      if (hasFlagged) reviewDates.push(key);
      days.push({ dateKey: key, isWeekday: true, status: hasFlagged ? "Incomplete" : openStatus, minutes: 0 });
      continue;
    }

    daysPresent++;
    const rawPaid = verified.reduce((sum, r) => sum + computeShiftPayBreakdown(r, scheduledStartTime).paidWorkingMinutes, 0);
    const paid = Math.min(SCHEDULED_PAID_MINUTES_PER_SHIFT, rawPaid);
    regularPaidMinutes += paid;
    unpaidMinutes += Math.max(0, SCHEDULED_PAID_MINUTES_PER_SHIFT - paid);
    days.push({
      dateKey: key,
      isWeekday: true,
      status: openStatus ?? "Clocked Out",
      minutes: verified.reduce((sum, r) => sum + (r.total_minutes ?? 0), 0),
    });
  }

  return {
    periodStart,
    periodEnd,
    weekdayCount,
    days,
    daysPresent,
    missedDates,
    reviewDates,
    flaggedDates,
    openTodayDate,
    regularPaidMinutes,
    unpaidMinutes,
    flaggedShifts,
  };
}
