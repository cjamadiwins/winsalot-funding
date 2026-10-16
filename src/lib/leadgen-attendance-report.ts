// Lead Generation CRM: pure "My Attendance" report calculations built on
// leadgen_agent_attendance rows (see leadgen-types.ts's
// LeadgenAgentAttendanceRow and migration 0044_leadgen_agent_attendance.sql)
// - the same live clock-in/out table this CRM's dashboard Attendance
// card and Admin Attendance page already read from. Deliberately its own
// file, not folded into leadgen-types.ts or leadgen-performance.ts, and
// deliberately self-contained from the Cleaning CRM's mirror
// (crm-attendance-report.ts) - same "these two CRMs' report logic must
// never accidentally couple" rationale as leadgen-performance.ts's own
// header comment.
//
// All "which calendar day does this timestamp fall on" math goes through
// leadgenDateKey (America/Toronto, the same timezone the rest of this
// CRM's Due Today/Overdue and performance-period logic already uses) -
// deliberately NOT the leadgen_agent_attendance.attendance_date column,
// which the database derives in UTC (see migration 0044's
// set_leadgen_agent_attendance_derived_fields trigger) and would put a
// late-evening Eastern clock-in on the wrong calendar day.

import type { LeadgenAgentAttendanceRow } from "./leadgen-types";
import { addDays, leadgenDateKey, leadgenMondayOf, leadgenWeekRangeLabel } from "./leadgen-performance";
import { SCHEDULED_PAID_MINUTES_PER_SHIFT } from "./attendance-pay";
import { analyzePayPeriod, holidayWageOffsetHours, type FlaggedShift, type SourcedShiftRow } from "./payroll-attendance";

export const LEADGEN_ATTENDANCE_TIMEZONE = "America/Toronto";
export const LEADGEN_ATTENDANCE_TIMEZONE_LABEL = "ET";

export type AttendanceStatus = "Clocked In" | "Clocked Out" | "Incomplete" | "Admin Clock-Out";

export const attendanceDateKey = leadgenDateKey;
export const weekStartOf = leadgenMondayOf;
export const weekRangeLabel = leadgenWeekRangeLabel;

// A row with no clock_out is either the agent's live, still-running
// session (its clock_in falls on today) or a stale open shift carried
// over from an earlier day that was never closed - the database only
// ever allows one open row per agent at a time, so these two cases are
// mutually exclusive and cover every open row that can exist.
export function attendanceStatus(row: LeadgenAgentAttendanceRow, todayKey: string): AttendanceStatus {
  if (row.clock_out) {
    return row.clocked_out_by_admin_id ? "Admin Clock-Out" : "Clocked Out";
  }
  return attendanceDateKey(row.clock_in) === todayKey ? "Clocked In" : "Incomplete";
}

// "7h 35m" / "45m" / "0m" - whole minutes only, matching the "7h 35m"
// display example from the brief.
export function formatDurationMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export type DailySession = {
  id: string;
  clockIn: string;
  clockOut: string | null;
  totalMinutes: number | null;
  status: AttendanceStatus;
};

export type DailyAttendanceView = {
  dateKey: string;
  sessions: DailySession[];
  // Never includes a still-open session's time - "Do not count an active
  // session as completed hours until it has been clocked out."
  completedMinutes: number;
  openSession: DailySession | null;
};

export function buildDailyView(
  rows: LeadgenAgentAttendanceRow[],
  dateKey: string,
  todayKey: string
): DailyAttendanceView {
  const sessions: DailySession[] = rows
    .filter((r) => attendanceDateKey(r.clock_in) === dateKey)
    .sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime())
    .map((r) => ({
      id: r.id,
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      totalMinutes: r.total_minutes,
      status: attendanceStatus(r, todayKey),
    }));

  const completedMinutes = sessions.reduce(
    (sum, s) => sum + (s.clockOut && s.totalMinutes != null ? s.totalMinutes : 0),
    0
  );
  const openSession = sessions.find((s) => s.clockOut === null) ?? null;

  return { dateKey, sessions, completedMinutes, openSession };
}

export type DayEntry = {
  dateKey: string;
  clockIn: string | null;
  clockOut: string | null;
  minutes: number;
  status: AttendanceStatus | null; // null = no session that day
};

function buildDayEntry(rows: LeadgenAgentAttendanceRow[], dateKey: string, todayKey: string): DayEntry {
  const daySessions = rows
    .filter((r) => attendanceDateKey(r.clock_in) === dateKey)
    .sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());

  if (daySessions.length === 0) {
    return { dateKey, clockIn: null, clockOut: null, minutes: 0, status: null };
  }

  const minutes = daySessions.reduce(
    (sum, r) => sum + (r.clock_out && r.total_minutes != null ? r.total_minutes : 0),
    0
  );
  const openOrIncomplete = daySessions.find((r) => !r.clock_out);
  const status: AttendanceStatus = openOrIncomplete
    ? attendanceStatus(openOrIncomplete, todayKey)
    : "Clocked Out";

  return {
    dateKey,
    clockIn: daySessions[0].clock_in,
    clockOut: daySessions[daySessions.length - 1].clock_out,
    minutes,
    status,
  };
}

// Payroll integration (see supabase/migrations/0063_payroll_attendance_
// integration.sql and src/app/leadgen/admin/(dashboard)/payroll/actions.ts):
// a per-weekday breakdown of an agent's attendance across an arbitrary pay
// period (14 days, not necessarily calendar-week-aligned like
// buildWeeklyView below). Only ever used to compute a *suggested*
// days_present/flagged-dates starting point for an admin building a
// payroll record - the admin can freely override every count before
// saving, and once saved, the payroll row's own columns are the source of
// truth (attendance changes afterward never retroactively alter a saved
// record, let alone a finalized one).
export type PayPeriodAttendanceDay = {
  dateKey: string;
  isWeekday: boolean;
  status: AttendanceStatus | null; // null = no session that day
  minutes: number;
};

// Both payroll summaries below are thin views over analyzePayPeriod
// (src/lib/payroll-attendance.ts), the one shared implementation used by the
// Growth AND Lead Generation CRMs - they cannot drift apart. They are only a
// *suggested* starting point for the admin's payroll form; every count can be
// overridden before saving, and a saved record never changes retroactively.
export type PayPeriodAttendanceSummary = {
  periodStart: string;
  periodEnd: string;
  days: PayPeriodAttendanceDay[]; // every calendar day in the period, in order
  weekdayCount: number; // standard working days suggestion (Mon-Fri only)
  daysPresent: number; // weekdays with a verified, completed (clocked out) shift
  // Weekdays with a clock-in but no clock-out that isn't today's live session.
  flaggedDates: string[];
  // Weekdays only evidenced by an irregular record (e.g. a forgotten
  // clock-out spanning days), or covered by one. Not counted present, not
  // counted missed - an admin must resolve them.
  reviewDates: string[];
  flaggedShifts: FlaggedShift[];
  // Approved paid-holiday weekdays in the period (all of them / the ones not
  // worked). An unworked paid holiday is not a missed day.
  holidayDates: string[];
  holidayOffDates: string[];
  // A weekday currently mid-shift (Clocked In, today only).
  openTodayDate: string | null;
};

export type PayPeriodHourlySummary = {
  periodStart: string;
  periodEnd: string;
  scheduledPaidHours: number; // weekday count x 7.5
  regularPaidHours: number; // verified paid working minutes / 60
  unpaidHours: number; // shortfall on verified days + fully missed days / 60
  daysPresent: number;
  missedDays: number; // weekdays with no attendance session at all
  flaggedDates: string[]; // weekdays with a clock-in but no clock-out
  reviewDates: string[];
  flaggedShifts: FlaggedShift[];
  // The most the unresolved review days could add if an admin confirms each
  // as one standard shift. Never derived from elapsed time.
  reviewMaxPaidHours: number;
  // Unworked approved paid holidays: paid through holiday pay, so they are
  // NOT worked hours and NOT unpaid. holidayWageOffsetHours is the part of
  // the period's wage those days stand for (7.5h each), which holiday pay
  // replaces so the day is paid once.
  holidayOffDates: string[];
  holidayWageOffsetHours: number;
  openTodayDate: string | null;
};

export function buildPayPeriodAttendanceSummary(
  rows: SourcedShiftRow[],
  periodStart: string,
  periodEnd: string,
  todayKey: string,
  paidHolidayDates: readonly string[] = []
): PayPeriodAttendanceSummary {
  const a = analyzePayPeriod(rows, periodStart, periodEnd, todayKey, null, attendanceDateKey, paidHolidayDates);
  return {
    periodStart,
    periodEnd,
    days: a.days,
    weekdayCount: a.weekdayCount,
    daysPresent: a.daysPresent,
    flaggedDates: a.flaggedDates,
    reviewDates: a.reviewDates,
    flaggedShifts: a.flaggedShifts,
    holidayDates: a.holidayDates,
    holidayOffDates: a.holidayOffDates,
    openTodayDate: a.openTodayDate,
  };
}

export function buildPayPeriodHourlySummary(
  rows: SourcedShiftRow[],
  periodStart: string,
  periodEnd: string,
  todayKey: string,
  scheduledStartTime: string | null,
  paidHolidayDates: readonly string[] = []
): PayPeriodHourlySummary {
  const a = analyzePayPeriod(rows, periodStart, periodEnd, todayKey, scheduledStartTime, attendanceDateKey, paidHolidayDates);
  return {
    periodStart,
    periodEnd,
    scheduledPaidHours: (a.weekdayCount * SCHEDULED_PAID_MINUTES_PER_SHIFT) / 60,
    regularPaidHours: a.regularPaidMinutes / 60,
    unpaidHours: a.unpaidMinutes / 60,
    daysPresent: a.daysPresent,
    missedDays: a.missedDates.length,
    flaggedDates: a.flaggedDates,
    reviewDates: a.reviewDates,
    flaggedShifts: a.flaggedShifts,
    reviewMaxPaidHours: (a.reviewDates.length * SCHEDULED_PAID_MINUTES_PER_SHIFT) / 60,
    holidayOffDates: a.holidayOffDates,
    holidayWageOffsetHours: holidayWageOffsetHours(a.holidayOffDates.length),
    openTodayDate: a.openTodayDate,
  };
}

export type WeeklyAttendanceView = {
  weekStart: string;
  weekEnd: string;
  days: DayEntry[]; // Monday..Sunday
  totalMinutes: number;
  daysWorked: number;
  averageMinutesPerWorkingDay: number;
};

export function buildWeeklyView(
  rows: LeadgenAgentAttendanceRow[],
  weekStart: string,
  todayKey: string
): WeeklyAttendanceView {
  const weekEnd = addDays(weekStart, 6);
  const days: DayEntry[] = [];
  let totalMinutes = 0;
  let daysWorked = 0;

  for (let i = 0; i < 7; i++) {
    const day = buildDayEntry(rows, addDays(weekStart, i), todayKey);
    days.push(day);
    totalMinutes += day.minutes;
    if (day.status !== null) daysWorked++;
  }

  return {
    weekStart,
    weekEnd,
    days,
    totalMinutes,
    daysWorked,
    averageMinutesPerWorkingDay: daysWorked > 0 ? Math.round(totalMinutes / daysWorked) : 0,
  };
}

export type MonthlyAttendanceView = {
  year: number;
  month: number; // 1-12
  monthLabel: string;
  days: DayEntry[]; // only dates with a session, ascending
  totalMinutes: number;
  daysWorked: number;
  averageMinutesPerWorkingDay: number;
  incompleteCount: number;
};

export function buildMonthlyView(
  rows: LeadgenAgentAttendanceRow[],
  year: number,
  month: number,
  todayKey: string
): MonthlyAttendanceView {
  const monthStart = `${year}-${pad2(month)}-01`;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${pad2(month)}-${pad2(lastDayOfMonth)}`;

  const dateKeys = new Set<string>();
  for (const row of rows) {
    const key = attendanceDateKey(row.clock_in);
    if (key >= monthStart && key <= monthEnd) dateKeys.add(key);
  }

  const days = Array.from(dateKeys)
    .sort()
    .map((dateKey) => buildDayEntry(rows, dateKey, todayKey));

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const daysWorked = days.length;
  const incompleteCount = days.filter((d) => d.status === "Incomplete").length;

  return {
    year,
    month,
    monthLabel: new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    days,
    totalMinutes,
    daysWorked,
    averageMinutesPerWorkingDay: daysWorked > 0 ? Math.round(totalMinutes / daysWorked) : 0,
    incompleteCount,
  };
}
