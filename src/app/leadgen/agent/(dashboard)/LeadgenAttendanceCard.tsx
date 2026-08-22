"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { LeadgenAgentAttendanceRow } from "@/lib/leadgen-types";
import {
  activeBreakStage,
  attendanceRecordStatus,
  ATTENDANCE_RECORD_STATUS_LABELS,
  BREAK_STAGE_LABELS,
  BREAK_STAGES,
  canClockOut,
  canStartBreak,
  computeShiftPayBreakdown,
  type BreakStage,
} from "@/lib/attendance-pay";
import {
  leadgenClockInAction,
  leadgenClockOutAction,
  leadgenStartBreak1Action,
  leadgenEndBreak1Action,
  leadgenStartLunchAction,
  leadgenEndLunchAction,
  leadgenStartBreak2Action,
  leadgenEndBreak2Action,
  type LeadgenAttendanceActionState,
} from "./leadgen-attendance-actions";

function formatElapsed(ms: number) {
  const safeMs = Math.max(ms, 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMinutes(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

const BREAK_ACTIONS: Record<BreakStage, { start: typeof leadgenStartBreak1Action; end: typeof leadgenEndBreak1Action }> = {
  break1: { start: leadgenStartBreak1Action, end: leadgenEndBreak1Action },
  lunch: { start: leadgenStartLunchAction, end: leadgenEndLunchAction },
  break2: { start: leadgenStartBreak2Action, end: leadgenEndBreak2Action },
};

function BreakControl({ stage, openShift }: { stage: BreakStage; openShift: LeadgenAgentAttendanceRow }) {
  const initial: LeadgenAttendanceActionState = { error: null };
  const [startState, startFormAction, startPending] = useActionState(BREAK_ACTIONS[stage].start, initial);
  const [endState, endFormAction, endPending] = useActionState(BREAK_ACTIONS[stage].end, initial);

  const active = activeBreakStage(openShift) === stage;
  const canStart = canStartBreak(openShift, stage);
  const used = !canStart && !active;
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
            disabled={!canStart || startPending}
            className="rounded-full border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startPending ? "Starting..." : `Start ${BREAK_STAGE_LABELS[stage]}`}
          </button>
        </form>
      )}
      {used && !active && <span className="text-xs text-slate-400">✓ used</span>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default function LeadgenAttendanceCard({ openShift }: { openShift: LeadgenAgentAttendanceRow | null }) {
  const [now, setNow] = useState(() => Date.now());
  const initialAttendanceState: LeadgenAttendanceActionState = { error: null };
  const [clockInState, clockInFormAction, clockInPending] = useActionState(
    leadgenClockInAction,
    initialAttendanceState
  );
  const [clockOutState, clockOutFormAction, clockOutPending] = useActionState(
    leadgenClockOutAction,
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

  const clockOutAllowed = openShift ? canClockOut(openShift) : false;
  const error = clockInState.error ?? clockOutState.error;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Attendance</h2>

      {!openShift && (
        <div className="mt-3">
          <p className="text-sm text-slate-600">Current Status: Clocked Out</p>
          <form action={clockInFormAction} className="mt-3">
            <button
              type="submit"
              disabled={clockInPending}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {clockInPending ? "Clocking In..." : "Clock In"}
            </button>
          </form>
        </div>
      )}

      {openShift && breakdown && status && (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold text-emerald-700">{ATTENDANCE_RECORD_STATUS_LABELS[status]}</p>
          <p className="text-sm text-slate-600">Clock-in time: {new Date(openShift.clock_in).toLocaleString()}</p>
          <p className="text-sm text-slate-600">Elapsed: {elapsedLabel}</p>
          <p className="text-sm text-slate-600">
            Paid working time so far: {formatMinutes(breakdown.paidWorkingMinutes)} of 7h 30m
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            {BREAK_STAGES.map((stage) => (
              <BreakControl key={stage} stage={stage} openShift={openShift} />
            ))}
          </div>

          <form action={clockOutFormAction} className="pt-1">
            <button
              type="submit"
              disabled={clockOutPending || !clockOutAllowed}
              title={!clockOutAllowed ? "End your current break before clocking out." : undefined}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {clockOutPending ? "Clocking Out..." : "Clock Out"}
            </button>
          </form>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <Link href="/leadgen/agent/my-attendance" className="mt-3 inline-block text-sm font-semibold text-sky-600 hover:text-sky-700">
        View My Attendance →
      </Link>
    </section>
  );
}
