// Shared, pure break-tracking + hourly-pay math used by both the
// Cleaning CRM (agent_attendance) and the Lead Generation CRM
// (leadgen_agent_attendance, migrations 0043/0044, extended by 0075).
// The two tables are entirely separate (separate agent pools, separate
// RLS), but the work-schedule and hourly-rate rules are identical, so
// they live here once instead of being duplicated per CRM - same
// "these two CRMs' rules are shared, their data is not" pattern as
// src/lib/payroll.ts and src/lib/leave-requests.ts.
//
// Work schedule (fixed by policy, not admin-configurable):
//  - Every scheduled shift is 8 hours, clock-in to clock-out, including
//    all breaks.
//  - One 30-minute unpaid lunch.
//  - Two 15-minute paid rest breaks.
//  - Total paid time for a completed shift is 7.5 hours (450 minutes).
//
// The unifying rule behind every deduction case in the spec (a full
// missed day, a late arrival, an early departure, excess break time) is
// simply: paid minutes for a shift are capped at the 450-minute
// schedule, and whatever falls short of that - for any reason - is the
// shift's shortfall, billed at the internal hourly rate. This avoids
// double-counting: a 15-minute-late arrival already shows up as 15
// fewer paid minutes once lunch and any excess break time are netted
// out, so it is never subtracted a second time as its own line item.
// late/early minutes are still computed and stored for display -
// "the record must show late arrival or early departure" - they just
// don't add a second, separate deduction on top of the shortfall they
// already explain.

export const SCHEDULED_SHIFT_MINUTES = 8 * 60;
export const SCHEDULED_LUNCH_MINUTES = 30;
export const SCHEDULED_BREAK_MINUTES = 15;
export const SCHEDULED_PAID_MINUTES_PER_SHIFT =
  SCHEDULED_SHIFT_MINUTES - SCHEDULED_LUNCH_MINUTES; // 450 minutes = 7.5 hours

export type BreakStage = "break1" | "lunch" | "break2";
export const BREAK_STAGES: BreakStage[] = ["break1", "lunch", "break2"];

export const BREAK_STAGE_LABELS: Record<BreakStage, string> = {
  break1: "Break 1",
  lunch: "Lunch",
  break2: "Break 2",
};

// The subset of an attendance row this module needs - matches the
// column names added to both agent_attendance and
// leadgen_agent_attendance by migration 0075 exactly, so either CRM's
// row type satisfies this via structural typing without an import.
export type AttendanceBreakFields = {
  clock_in: string;
  clock_out: string | null;
  break1_start: string | null;
  break1_end: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  break2_start: string | null;
  break2_end: string | null;
};

function stageStart(row: AttendanceBreakFields, stage: BreakStage): string | null {
  if (stage === "break1") return row.break1_start;
  if (stage === "lunch") return row.lunch_start;
  return row.break2_start;
}

function stageEnd(row: AttendanceBreakFields, stage: BreakStage): string | null {
  if (stage === "break1") return row.break1_end;
  if (stage === "lunch") return row.lunch_end;
  return row.break2_end;
}

// The permitted duration of a stage - 30 minutes for lunch, 15 for
// either rest break. Time beyond this is unpaid, whichever stage it is.
function stageAllowedMinutes(stage: BreakStage): number {
  return stage === "lunch" ? SCHEDULED_LUNCH_MINUTES : SCHEDULED_BREAK_MINUTES;
}

// The break currently open (started, not yet ended) on this row, or
// null if none is - "Only one break may be active at a time," enforced
// at the database level (migration 0075's *_one_active_break check), so
// at most one of these is ever true.
export function activeBreakStage(row: AttendanceBreakFields): BreakStage | null {
  for (const stage of BREAK_STAGES) {
    if (stageStart(row, stage) && !stageEnd(row, stage)) return stage;
  }
  return null;
}

// Whether "Start <Stage>" should be enabled: the shift is open, no other
// break is currently active, and this stage hasn't already been used.
export function canStartBreak(row: AttendanceBreakFields, stage: BreakStage): boolean {
  if (row.clock_out) return false;
  if (stageStart(row, stage)) return false;
  return activeBreakStage(row) === null;
}

// Whether "End <Stage>" should be enabled: this exact stage is the one
// currently active.
export function canEndBreak(row: AttendanceBreakFields, stage: BreakStage): boolean {
  return activeBreakStage(row) === stage;
}

// Whether "Clock Out" should be enabled: the shift is open and no break
// is currently active (ending a break is required first).
export function canClockOut(row: AttendanceBreakFields): boolean {
  return !row.clock_out && activeBreakStage(row) === null;
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

export type BreakDuration = {
  stage: BreakStage;
  minutes: number; // actual duration, 0 if never started
  allowedMinutes: number;
  excessMinutes: number; // time beyond the permitted duration - unpaid
  paidMinutes: number; // for lunch this is always 0 (lunch is always unpaid)
  isOpen: boolean;
};

// One stage's actual duration - if it's still open, measured against
// `nowIso` (a live, ticking figure for the UI) rather than left at 0.
function computeBreakDuration(row: AttendanceBreakFields, stage: BreakStage, nowIso: string): BreakDuration {
  const start = stageStart(row, stage);
  const end = stageEnd(row, stage);
  const isOpen = !!start && !end;
  const minutes = start ? minutesBetween(start, end ?? nowIso) : 0;
  const allowedMinutes = stageAllowedMinutes(stage);
  const excessMinutes = Math.max(0, minutes - allowedMinutes);
  // Lunch is always unpaid in full - "The 30-minute lunch is already
  // unpaid." A rest break's first 15 minutes are paid, only the excess
  // is unpaid - "The two authorized 15-minute breaks remain paid."
  const paidMinutes = stage === "lunch" ? 0 : Math.min(minutes, allowedMinutes);
  return { stage, minutes, allowedMinutes, excessMinutes, paidMinutes, isOpen };
}

export function computeBreakDurations(
  row: AttendanceBreakFields,
  nowIso: string = new Date().toISOString()
): Record<BreakStage, BreakDuration> {
  return {
    break1: computeBreakDuration(row, "break1", nowIso),
    lunch: computeBreakDuration(row, "lunch", nowIso),
    break2: computeBreakDuration(row, "break2", nowIso),
  };
}

// "HH:MM" (24-hour, e.g. from a <input type="time">, or crm_users /
// leadgen_users.scheduled_start_time as returned by Postgres) parsed
// into minutes since midnight.
function parseTimeOfDayMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export type ShiftPayBreakdown = {
  totalMinutes: number; // clock-in to clock-out span (null while open)
  lunchMinutes: number;
  break1Minutes: number;
  break2Minutes: number;
  excessBreakMinutes: number; // break1 + break2 time beyond 15 min each
  paidWorkingMinutes: number; // totalMinutes - lunch - excess break time, capped at the 450-minute schedule
  scheduledPaidMinutes: number; // always 450 for a tracked shift
  shortfallMinutes: number; // scheduledPaidMinutes - paidWorkingMinutes, floored at 0
  lateMinutes: number; // clock-in after the agent's scheduled start, if one is configured
  earlyDepartureMinutes: number; // clock-out before the scheduled end, if configured
};

// The full per-shift breakdown the attendance record must show: "Total
// shift duration, Paid working hours, Unpaid lunch duration, Paid break
// durations, Late arrival or early departure." Returns null fields as 0
// while the shift is still open (clock_out is null) except totalMinutes,
// which uses `nowIso` for a live-updating figure.
export function computeShiftPayBreakdown(
  row: AttendanceBreakFields,
  scheduledStartTime: string | null,
  nowIso: string = new Date().toISOString()
): ShiftPayBreakdown {
  const breaks = computeBreakDurations(row, nowIso);
  const totalMinutes = minutesBetween(row.clock_in, row.clock_out ?? nowIso);
  const excessBreakMinutes = breaks.break1.excessMinutes + breaks.break2.excessMinutes;
  const paidWorkingMinutes = Math.min(
    SCHEDULED_PAID_MINUTES_PER_SHIFT,
    Math.max(0, totalMinutes - breaks.lunch.minutes - excessBreakMinutes)
  );
  const shortfallMinutes = row.clock_out
    ? Math.max(0, SCHEDULED_PAID_MINUTES_PER_SHIFT - paidWorkingMinutes)
    : 0;

  let lateMinutes = 0;
  let earlyDepartureMinutes = 0;
  const scheduledStartMinutes = scheduledStartTime ? parseTimeOfDayMinutes(scheduledStartTime) : null;
  if (scheduledStartMinutes != null) {
    const clockIn = new Date(row.clock_in);
    const dayStart = new Date(clockIn);
    dayStart.setHours(0, 0, 0, 0);
    const scheduledStartAt = new Date(dayStart.getTime() + scheduledStartMinutes * 60000);
    const scheduledEndAt = new Date(scheduledStartAt.getTime() + SCHEDULED_SHIFT_MINUTES * 60000);

    lateMinutes = Math.max(0, Math.round((clockIn.getTime() - scheduledStartAt.getTime()) / 60000));
    if (row.clock_out) {
      const clockOut = new Date(row.clock_out);
      earlyDepartureMinutes = Math.max(0, Math.round((scheduledEndAt.getTime() - clockOut.getTime()) / 60000));
    }
  }

  return {
    totalMinutes,
    lunchMinutes: breaks.lunch.minutes,
    break1Minutes: breaks.break1.minutes,
    break2Minutes: breaks.break2.minutes,
    excessBreakMinutes,
    paidWorkingMinutes,
    scheduledPaidMinutes: SCHEDULED_PAID_MINUTES_PER_SHIFT,
    shortfallMinutes,
    lateMinutes,
    earlyDepartureMinutes,
  };
}

export type AttendanceRecordStatus =
  | "clocked_in"
  | "on_break"
  | "present"
  | "late"
  | "early_departure"
  | "incomplete";

export const ATTENDANCE_RECORD_STATUS_LABELS: Record<AttendanceRecordStatus, string> = {
  clocked_in: "Clocked In",
  on_break: "On Break",
  present: "Present",
  late: "Late Arrival",
  early_departure: "Early Departure",
  incomplete: "Incomplete",
};

// "Attendance status" for a single shift record - late/early take
// priority over a plain "Present" once the shift is closed, since they
// are exactly the exception cases the record is meant to flag.
export function attendanceRecordStatus(
  row: AttendanceBreakFields,
  breakdown: ShiftPayBreakdown,
  isStillToday: boolean
): AttendanceRecordStatus {
  if (!row.clock_out) {
    if (!isStillToday) return "incomplete";
    return activeBreakStage(row) ? "on_break" : "clocked_in";
  }
  if (breakdown.lateMinutes > 0) return "late";
  if (breakdown.earlyDepartureMinutes > 0) return "early_departure";
  return "present";
}

// The internal hourly rate: standard biweekly wage divided by the
// standard paid hours in a period, e.g. ₦50,000 / 75 = ₦666.6667 per
// paid hour. Deliberately not rounded here - "Round only the final
// payroll amount, not each daily calculation" - callers only round the
// final Naira total they write to a currency column.
export function internalHourlyRate(standardBiweeklyWage: number, standardPaidHours: number): number {
  if (standardPaidHours <= 0) return 0;
  return standardBiweeklyWage / standardPaidHours;
}

// The unpaid-shortfall deduction for one shift, in Naira, at full
// (unrounded) precision - the caller sums these across a pay period and
// rounds only the final total. "One completely missed unpaid day equals
// 7.5 hours and a ₦5,000 wage deduction" falls straight out of this:
// shortfallMinutes = 450, hourlyRate = 666.6667 -> 450/60 * 666.6667 =
// ₦5,000.0025, which is exactly ₦5,000 once the pay period's total
// deduction is rounded to the nearest cent at the end.
export function shiftDeductionAmount(shortfallMinutes: number, hourlyRate: number): number {
  return (shortfallMinutes / 60) * hourlyRate;
}

// A fully-missed scheduled working day (no attendance record at all,
// and not covered by approved paid leave) - the full 450-minute
// schedule is unpaid shortfall for that day.
export const FULL_DAY_SHORTFALL_MINUTES = SCHEDULED_PAID_MINUTES_PER_SHIFT;
