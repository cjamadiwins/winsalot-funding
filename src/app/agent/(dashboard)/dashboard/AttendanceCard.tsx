"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { AgentAttendanceRow } from "@/lib/crm-types";
import {
  activeBreakStage,
  attendanceRecordStatus,
  ATTENDANCE_RECORD_STATUS_LABELS,
  BREAK_STAGE_LABELS,
  BREAK_STAGE_START_LABELS,
  BREAK_STAGES,
  canClockOut,
  canStartBreak,
  computeCountdownState,
  computeShiftPayBreakdown,
  stageCompleted,
  type BreakStage,
} from "@/lib/attendance-pay";
import {
  ALARM_MAX_DURATION_MS,
  ALARM_REPEAT_MS,
  playAlarmSound,
  playGentleAlertSound,
} from "@/lib/attendance-sound";
import {
  clockInAction,
  clockOutAction,
  startBreak1Action,
  endBreak1Action,
  startLunchAction,
  endLunchAction,
  startBreak2Action,
  endBreak2Action,
  type AttendanceActionState,
} from "./attendance-actions";

function formatElapsed(ms: number) {
  const safeMs = Math.max(ms, 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
}

function formatMinutes(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

const BREAK_ACTIONS: Record<BreakStage, { start: typeof startBreak1Action; end: typeof endBreak1Action }> = {
  break1: { start: startBreak1Action, end: endBreak1Action },
  lunch: { start: startLunchAction, end: endLunchAction },
  break2: { start: startBreak2Action, end: endBreak2Action },
};

function BreakControl({ stage, openShift, now }: { stage: BreakStage; openShift: AgentAttendanceRow; now: number }) {
  const initial: AttendanceActionState = { error: null };
  const [startState, startFormAction, startPending] = useActionState(BREAK_ACTIONS[stage].start, initial);
  const [endState, endFormAction, endPending] = useActionState(BREAK_ACTIONS[stage].end, initial);

  const active = activeBreakStage(openShift) === stage;
  const completed = stageCompleted(openShift, stage);
  const canStart = canStartBreak(openShift, stage, now);
  const error = startState.error ?? endState.error;

  return (
    <div className="flex items-center gap-2">
      {active ? (
        <form action={endFormAction}>
          <button
            type="submit"
            disabled={endPending}
            className="rounded-full bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {endPending ? "Ending..." : `End ${BREAK_STAGE_LABELS[stage]}`}
          </button>
        </form>
      ) : (
        <form action={startFormAction}>
          <button
            type="submit"
            disabled={!canStart || startPending || completed}
            className="rounded-full border border-[var(--color-border)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-ink-strong)] transition hover:bg-[var(--crm-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startPending ? "Starting..." : BREAK_STAGE_START_LABELS[stage]}
          </button>
        </form>
      )}
      {completed && !active && <span className="text-xs text-[var(--color-text-muted)]">✓ used</span>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default function AttendanceCard({ openShift }: { openShift: AgentAttendanceRow | null }) {
  const [now, setNow] = useState(() => Date.now());
  const initialAttendanceState: AttendanceActionState = { error: null };
  const [clockInState, clockInFormAction, clockInPending] = useActionState(
    clockInAction,
    initialAttendanceState
  );
  const [clockOutState, clockOutFormAction, clockOutPending] = useActionState(
    clockOutAction,
    initialAttendanceState
  );

  useEffect(() => {
    if (!openShift) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [openShift]);

  const elapsedLabel = useMemo(() => {
    if (!openShift) return null;
    return formatElapsed(now - new Date(openShift.clock_in).getTime());
  }, [openShift, now]);

  const breakdown = useMemo(() => {
    if (!openShift) return null;
    return computeShiftPayBreakdown(openShift, null, new Date(now).toISOString());
  }, [openShift, now]);

  const status = useMemo(() => {
    if (!openShift || !breakdown) return null;
    return attendanceRecordStatus(openShift, breakdown, true);
  }, [openShift, breakdown]);

  const countdown = useMemo(() => {
    if (!openShift) return null;
    return computeCountdownState(openShift, now);
  }, [openShift, now]);

  // The clock-out due alert is unchanged from before: a single gentle
  // chime the instant the shift's 8 hours are up, one-time-per-phase.
  // Break/lunch start- and end-of-break alerts are handled below by the
  // repeating alarm instead, so this only ever fires for "clock_out_due".
  const lastAlertedPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!countdown) {
      lastAlertedPhaseRef.current = null;
      return;
    }
    if (countdown.phase === "clock_out_due" && lastAlertedPhaseRef.current !== countdown.phase) {
      lastAlertedPhaseRef.current = countdown.phase;
      playGentleAlertSound();
    } else if (countdown.phase !== "clock_out_due") {
      lastAlertedPhaseRef.current = null;
    }
  }, [countdown]);

  // The start-of-break ("It's time for your break.") and end-of-break
  // ("Your break has ended. Please resume calls.") warnings for Break 1,
  // Lunch, and Break 2 - a repeating alarm the agent must actively
  // acknowledge, capped at 30 seconds so it can never ring forever.
  // Clock-out's own alert is intentionally excluded (handled above,
  // unchanged) since the request named only the three break stages.
  const alarmCondition =
    !!countdown && (countdown.isDue || (countdown.isOverdue && countdown.phase !== "clock_out_due"));
  const alarmMessage = countdown?.isDue ? countdown.dueMessage : countdown?.overdueMessage ?? null;
  const [alarmAcknowledged, setAlarmAcknowledged] = useState(false);
  const wasAlarmConditionRef = useRef(false);
  useEffect(() => {
    if (alarmCondition && !wasAlarmConditionRef.current) {
      setAlarmAcknowledged(false);
    }
    wasAlarmConditionRef.current = alarmCondition;
  }, [alarmCondition]);

  const alarmActive = alarmCondition && !alarmAcknowledged;
  useEffect(() => {
    if (!alarmActive) return;
    playAlarmSound();
    const intervalId = window.setInterval(() => playAlarmSound(), ALARM_REPEAT_MS);
    const timeoutId = window.setTimeout(() => window.clearInterval(intervalId), ALARM_MAX_DURATION_MS);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [alarmActive]);

  const clockOutAllowed = openShift ? canClockOut(openShift) : false;
  const error = clockInState.error ?? clockOutState.error;

  return (
    <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5 shadow-sm">
      {alarmActive && alarmMessage && (
        <div className="fixed inset-x-0 top-0 z-50 flex flex-col items-center justify-center gap-2 bg-rose-600 px-4 py-3 text-center shadow-lg sm:flex-row sm:gap-4">
          <p className="text-base font-bold text-white">{alarmMessage}</p>
          <button
            type="button"
            onClick={() => setAlarmAcknowledged(true)}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Acknowledge / Stop Alarm
          </button>
        </div>
      )}

      <h2 className="font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">Attendance</h2>

      {!openShift && (
        <div className="mt-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            You are currently clocked out.
          </p>
          <form action={clockInFormAction} className="mt-4">
            <button
              type="submit"
              disabled={clockInPending}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {clockInPending ? "Clocking In..." : "Clock In"}
            </button>
          </form>
        </div>
      )}

      {openShift && breakdown && status && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-700">{ATTENDANCE_RECORD_STATUS_LABELS[status]}</p>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Clock-in time: {new Date(openShift.clock_in).toLocaleString()}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">Elapsed: {elapsedLabel}</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Paid working time so far: {formatMinutes(breakdown.paidWorkingMinutes)} of 7h 30m
          </p>

          {countdown && (
            <div
              className={`rounded-xl border px-4 py-3 ${
                countdown.isOverdue || countdown.isDue
                  ? "border-amber-300 bg-amber-50"
                  : "border-[var(--color-border)] bg-[var(--crm-surface-2)]"
              }`}
            >
              <p
                className={`text-sm font-semibold tabular-nums ${
                  countdown.isOverdue || countdown.isDue ? "text-amber-800" : "text-[var(--color-ink-strong)]"
                }`}
              >
                {countdown.label}
              </p>
              {countdown.overdueMessage && countdown.overdueMessage !== countdown.label && (
                <p className="mt-1 text-sm text-amber-700">{countdown.overdueMessage}</p>
              )}
              {countdown.dueMessage && (
                <p className="mt-1 text-sm text-amber-700">{countdown.dueMessage}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {BREAK_STAGES.map((stage) => (
              <BreakControl key={stage} stage={stage} openShift={openShift} now={now} />
            ))}
          </div>

          <form action={clockOutFormAction} className="pt-2">
            <button
              type="submit"
              disabled={clockOutPending || !clockOutAllowed}
              title={!clockOutAllowed ? "End your current break before clocking out." : undefined}
              className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {clockOutPending ? "Clocking Out..." : "Clock Out"}
            </button>
          </form>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <Link
        href="/agent/my-attendance"
        className="mt-4 inline-block text-sm font-semibold text-[var(--color-accent)] hover:underline"
      >
        View My Attendance →
      </Link>
    </section>
  );
}
