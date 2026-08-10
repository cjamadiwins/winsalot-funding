// Cleaning CRM: pure "My Attendance" report calculations built on
// agent_attendance rows (see crm-types.ts's AgentAttendanceRow and
// migration 0043_crm_agent_attendance.sql) - the same live clock-in/out
// table this CRM's dashboard Attendance card and Admin Attendance page
// already read from. Deliberately its own file, not folded into
// crm-types.ts or crm-performance.ts, and deliberately self-contained
// from the Lead Gen CRM's mirror (leadgen-attendance-report.ts) - same
// "these two CRMs' report logic must never accidentally couple"
// rationale as crm-performance.ts's own header comment.
//
// All "which calendar day does this timestamp fall on" math goes through
// crmDateKey (America/Toronto, the same timezone the rest of this CRM's
// Due Today/Overdue and performance-period logic already uses), so an
// agent's Daily/Weekly/Monthly attendance always lines up with the same
// wall-clock day they experienced it on, not whatever timezone the
// server process happens to run in.

import type { AgentAttendanceRow } from "./crm-types";
import { addDays, crmDateKey } from "./crm-performance";

export const CRM_ATTENDANCE_TIMEZONE = "America/Toronto";
export const CRM_ATTENDANCE_TIMEZONE_LABEL = "ET";

export type AttendanceStatus = "Clocked In" | "Clocked Out" | "Incomplete" | "Admin Clock-Out";

export const attendanceDateKey = crmDateKey;

// A row with no clock_out is either the agent's live, still-running
// session (its clock_in falls on today) or a stale open shift carried
// over from an earlier day that was never closed - the database only
// ever allows one open row per agent at a time, so these two cases are
// mutually exclusive and cover every open row that can exist.
export function attendanceStatus(row: AgentAttendanceRow, todayKey: string): AttendanceStatus {
  if (row.clock_out) {
    return row.clocked_out_by_admin_id ? "Admin Clock-Out" : "Clocked Out";
  }
  return attendanceDateKey(row.clock_in) === todayKey ? "Clocked In" : "Incomplete";
}

// "7h 35m" / "45m" / "0m" - whole minutes only, matching the "7h 35m"
// display example from the brief. Distinct from crm-types.ts's
// attendanceHoursLabel, which formats crm_attendance's fractional-hours
// column rather than agent_attendance's whole-minutes one.
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

// Monday of the calendar week containing dateKey.
export function weekStartOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, diffToMonday);
}

export function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
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

export function buildDailyView(rows: AgentAttendanceRow[], dateKey: string, todayKey: string): DailyAttendanceView {
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

function buildDayEntry(rows: AgentAttendanceRow[], dateKey: string, todayKey: string): DayEntry {
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

export type WeeklyAttendanceView = {
  weekStart: string;
  weekEnd: string;
  days: DayEntry[]; // Monday..Sunday
  totalMinutes: number;
  daysWorked: number;
  averageMinutesPerWorkingDay: number;
};

export function buildWeeklyView(rows: AgentAttendanceRow[], weekStart: string, todayKey: string): WeeklyAttendanceView {
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
  rows: AgentAttendanceRow[],
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
