"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { AgentAttendanceRow } from "@/lib/crm-types";
import {
  clockInAction,
  clockOutAction,
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

  const error = clockInState.error ?? clockOutState.error;

  return (
    <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
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

      {openShift && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-700">Currently Clocked In</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Clock-in time: {new Date(openShift.clock_in).toLocaleString()}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">Elapsed: {elapsedLabel}</p>

          <form action={clockOutFormAction} className="pt-2">
            <button
              type="submit"
              disabled={clockOutPending}
              className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
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
    </section>
  );
}
