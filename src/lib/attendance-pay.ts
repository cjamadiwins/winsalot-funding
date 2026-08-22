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

// "Start Break 1 — 15 min" / "Start Lunch — 30 min" / "Start Break 2 —
// 15 min" - the exact button copy requested, since each stage's allowed
// duration needs to be visible on the button itself, not just implied.
export const BREAK_STAGE_START_LABELS: Record<BreakStage, string> = {
  break1: "Start Break 1 — 15 min",
  lunch: "Start Lunch — 30 min",
  break2: "Start Break 2 — 15 min",
};

// Break scheduling: each stage's allowed start time is a fixed offset
// from clock-in, not admin-configurable and not tied to the wall-clock
// scheduled_start_time used for late/early-departure payroll (a
// different, pre-existing feature - see computeShiftPayBreakdown below,
// which this section never touches). A 9:00 AM clock-in schedules
// Break 1 11:00-11:15, Lunch 1:00-1:30 PM, Break 2 3:00-3:15 PM, and
// clock-out at 5:00 PM, exactly as specified.
export const BREAK1_OFFSET_MINUTES = 120; // 2 hours after clock-in
export const LUNCH_OFFSET_MINUTES = 240; // 4 hours after clock-in
export const BREAK2_OFFSET_MINUTES = 360; // 6 hours after clock-in
export const CLOCK_OUT_OFFSET_MINUTES = SCHEDULED_SHIFT_MINUTES; // 8 hours after clock-in

function stageOffsetMinutes(stage: BreakStage): number {
  if (stage === "break1") return BREAK1_OFFSET_MINUTES;
  if (stage === "lunch") return LUNCH_OFFSET_MINUTES;
  return BREAK2_OFFSET_MINUTES;
}

// The instant (ms since epoch) a stage's scheduled window opens, e.g.
// clock-in + 2 hours for Break 1.
export function scheduledStageStartMs(clockIn: string, stage: BreakStage): number {
  return new Date(clockIn).getTime() + stageOffsetMinutes(stage) * 60000;
}

// The instant the shift's scheduled clock-out falls at - clock-in + 8
// hours, "Apply the same countdown behaviour ... to clock-out."
export function scheduledClockOutMs(clockIn: string): number {
  return new Date(clockIn).getTime() + CLOCK_OUT_OFFSET_MINUTES * 60000;
}

// The stage immediately before `stage` in the required Break 1 -> Lunch
// -> Break 2 order, or null for Break 1 (nothing comes before it).
function priorStage(stage: BreakStage): BreakStage | null {
  if (stage === "lunch") return "break1";
  if (stage === "break2") return "lunch";
  return null;
}

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
// break is currently active, this stage hasn't already been used, its
// scheduled window (clock-in + offset) has arrived, and every earlier
// stage has already been completed - "Breaks must be taken in order."
// `nowMs` defaults to the caller's own clock; server actions always let
// this default to the server's Date.now() rather than trusting a
// client-supplied time, so an agent can never spoof an early start by
// forging their local clock.
export function canStartBreak(row: AttendanceBreakFields, stage: BreakStage, nowMs: number = Date.now()): boolean {
  if (row.clock_out) return false;
  if (stageStart(row, stage)) return false;
  if (activeBreakStage(row) !== null) return false;

  const before = priorStage(stage);
  if (before && !stageEnd(row, before)) return false;

  return nowMs >= scheduledStageStartMs(row.clock_in, stage);
}

// Whether "End <Stage>" should be enabled: this exact stage is the one
// currently active.
export function canEndBreak(row: AttendanceBreakFields, stage: BreakStage): boolean {
  return activeBreakStage(row) === stage;
}

// Whether this stage has already been started and ended - "used up" for
// this shift. Distinct from `!canStartBreak(...)`, which is also false
// for a stage that's simply not due yet or blocked by ordering.
export function stageCompleted(row: AttendanceBreakFields, stage: BreakStage): boolean {
  return !!stageEnd(row, stage);
}

// A precise, user-facing reason `canStartBreak` returned false, for the
// server actions' error messages (the button itself is already disabled
// client-side for all of these; this only matters for a stale click or
// a forged request). Callers should only call this when canStartBreak
// already returned false.
export function describeCannotStartBreak(row: AttendanceBreakFields, stage: BreakStage, nowMs: number = Date.now()): string {
  if (row.clock_out) return "You are already clocked out.";
  if (stageCompleted(row, stage)) return "This break has already been used for this shift.";
  if (activeBreakStage(row) !== null) return "End your current break before starting another one.";

  const before = priorStage(stage);
  if (before && !stageEnd(row, before)) {
    return `Complete ${BREAK_STAGE_LABELS[before]} before starting ${BREAK_STAGE_LABELS[stage]}.`;
  }

  if (nowMs < scheduledStageStartMs(row.clock_in, stage)) {
    return `${BREAK_STAGE_LABELS[stage]} isn't scheduled to start yet.`;
  }

  return "This break isn't available right now.";
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

// ---------------------------------------------------------------------
// Live countdown display (agent attendance card + admin live status).
// Purely presentational - none of this feeds computeShiftPayBreakdown
// or any payroll figure; the unpaid-excess-break math above is
// unchanged and already does the actual accounting.
// ---------------------------------------------------------------------

export type CountdownPhase =
  | "before_break1"
  | "break1_active"
  | "break1_exceeded"
  | "before_lunch"
  | "lunch_active"
  | "lunch_exceeded"
  | "before_break2"
  | "break2_active"
  | "break2_exceeded"
  | "before_clock_out"
  | "clock_out_due";

// One stage's "*_active"/"*_exceeded" phase pairing, keyed the same way
// BreakStage is - used to recover which stage a countdown phase is
// about, e.g. for picking the right audio-alert trigger in the UI.
export const COUNTDOWN_PHASE_STAGE: Partial<Record<CountdownPhase, BreakStage>> = {
  break1_active: "break1",
  break1_exceeded: "break1",
  lunch_active: "lunch",
  lunch_exceeded: "lunch",
  break2_active: "break2",
  break2_exceeded: "break2",
};

export type CountdownState = {
  phase: CountdownPhase;
  label: string; // "Break 1 begins in 10:00" / "Lunch — 14:59 remaining" / "Break 2 exceeded — 00:42" / "Clock-out in 10:00"
  // Seconds until the boundary for "before_*"/"*_active" phases;
  // seconds *since* the boundary (a live count-up) for "*_exceeded" and
  // "clock_out_due". Always >= 0.
  seconds: number;
  // True exactly for the phases where the allowed window has been
  // exceeded / the shift is overdue - the UI plays its one-time alert
  // sound the instant a countdown enters one of these.
  isOverdue: boolean;
  // The message shown alongside the count-up once overdue - "Your break
  // has ended. Please resume calls." for a break/lunch, a clock-out
  // specific message once the shift's 8 hours are up.
  overdueMessage: string | null;
  // True exactly the instant a not-yet-started stage's scheduled start
  // time arrives (the "before_break1"/"before_lunch"/"before_break2"
  // phases only) - distinct from `isOverdue`, which is about the
  // *end* of an active break, not the start of one. The UI plays its
  // own one-time alert sound for this transition too.
  isDue: boolean;
  // "It's time for your break." - shown once a break/lunch stage becomes
  // due (same fixed wording for Break 1, Lunch, and Break 2 - "Show a
  // prominent on-screen warning: 'It's time for your break.'"). Never
  // set for the clock-out countdown - only breaks/lunch get a
  // start-time alert.
  dueMessage: string | null;
};

function formatMmSs(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

const BREAK_ENDED_MESSAGE = "Your break has ended. Please resume calls.";
const CLOCK_OUT_DUE_MESSAGE = "Your shift has ended. Please clock out.";

// The single live countdown to show on the attendance card / admin live
// status for an open shift, reflecting whichever stage is currently
// relevant: counting down to a not-yet-started stage's scheduled start,
// counting down an active break/lunch's allowed duration, counting up
// once that allowed duration is exceeded, or counting down to the
// scheduled clock-out once every break has been completed. Returns null
// once the shift is closed (clock_out is set) - there is nothing left
// to count down to.
export function computeCountdownState(row: AttendanceBreakFields, nowMs: number = Date.now()): CountdownState | null {
  if (row.clock_out) return null;

  const active = activeBreakStage(row);
  if (active) {
    const startMs = new Date(stageStart(row, active) as string).getTime();
    const allowedMs = stageAllowedMinutes(active) * 60000;
    const elapsedMs = nowMs - startMs;
    const remainingMs = allowedMs - elapsedMs;
    const stageLabel = BREAK_STAGE_LABELS[active];

    if (remainingMs > 0) {
      return {
        phase: `${active}_active` as CountdownPhase,
        label: `${stageLabel} — ${formatMmSs(remainingMs / 1000)} remaining`,
        seconds: Math.ceil(remainingMs / 1000),
        isOverdue: false,
        overdueMessage: null,
        isDue: false,
        dueMessage: null,
      };
    }

    const overSeconds = -remainingMs / 1000;
    return {
      phase: `${active}_exceeded` as CountdownPhase,
      label: `${stageLabel} exceeded — ${formatMmSs(overSeconds)}`,
      seconds: Math.ceil(overSeconds),
      isOverdue: true,
      overdueMessage: BREAK_ENDED_MESSAGE,
      isDue: false,
      dueMessage: null,
    };
  }

  const pending: { stage: BreakStage; phase: CountdownPhase }[] = [
    { stage: "break1", phase: "before_break1" },
    { stage: "lunch", phase: "before_lunch" },
    { stage: "break2", phase: "before_break2" },
  ];
  const next = pending.find((p) => !stageEnd(row, p.stage));

  if (next) {
    const dueMs = scheduledStageStartMs(row.clock_in, next.stage);
    const remainingMs = dueMs - nowMs;
    const stageLabel = BREAK_STAGE_LABELS[next.stage];

    if (remainingMs > 0) {
      return {
        phase: next.phase,
        label: `${stageLabel} begins in ${formatMmSs(remainingMs / 1000)}`,
        seconds: Math.ceil(remainingMs / 1000),
        isOverdue: false,
        overdueMessage: null,
        isDue: false,
        dueMessage: null,
      };
    }

    return {
      phase: next.phase,
      label: `${stageLabel} available now`,
      seconds: 0,
      isOverdue: false,
      overdueMessage: null,
      isDue: true,
      dueMessage: "It's time for your break.",
    };
  }

  // Every break has been completed - the only thing left to count down
  // to is the scheduled clock-out itself. No start-time alert here -
  // "Apply the same start-time alert to Lunch and Break 2" names only
  // the three break stages, and the existing clock-out countdown/alert
  // is left exactly as it was.
  const clockOutDueMs = scheduledClockOutMs(row.clock_in);
  const remainingMs = clockOutDueMs - nowMs;
  if (remainingMs > 0) {
    return {
      phase: "before_clock_out",
      label: `Clock-out in ${formatMmSs(remainingMs / 1000)}`,
      seconds: Math.ceil(remainingMs / 1000),
      isOverdue: false,
      overdueMessage: null,
      isDue: false,
      dueMessage: null,
    };
  }

  return {
    phase: "clock_out_due",
    label: CLOCK_OUT_DUE_MESSAGE,
    isDue: false,
    dueMessage: null,
    seconds: Math.ceil(-remainingMs / 1000),
    isOverdue: true,
    overdueMessage: CLOCK_OUT_DUE_MESSAGE,
  };
}
