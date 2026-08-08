"use client";

import { useMemo, useState, useTransition } from "react";
import type { CrmAttendanceRow } from "@/lib/crm-types";
import { attendanceHoursLabel } from "@/lib/crm-types";
import { clockInAction, clockOutAction } from "./actions";

export default function AttendanceClient({
  records,
  agentName,
}: {
  records: CrmAttendanceRow[];
  agentName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // At most one row can ever have clock_out_at === null (enforced by
  // crm_attendance_one_open_session_per_agent), so the first match is the
  // caller's current open session, if any.
  const openSession = useMemo(() => records.find((r) => !r.clock_out_at) ?? null, [records]);

  function handleClockIn() {
    setError(null);
    startTransition(async () => {
      const result = await clockInAction();
      if (result.error) setError(result.error);
    });
  }

  function handleClockOut() {
    if (!openSession) return;
    setError(null);
    startTransition(async () => {
      const result = await clockOutAction(openSession.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5">
        <div>
          <p className="text-sm font-medium text-[var(--color-ink-strong)]">{agentName}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {openSession
              ? `Clocked in at ${new Date(openSession.clock_in_at).toLocaleString()}`
              : "Not currently clocked in."}
          </p>
        </div>
        <div className="ml-auto flex gap-3">
          <button
            type="button"
            onClick={handleClockIn}
            disabled={isPending || !!openSession}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clock In
          </button>
          <button
            type="button"
            onClick={handleClockOut}
            disabled={isPending || !openSession}
            className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clock Out
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Clock In</th>
              <th className="px-4 py-3">Clock Out</th>
              <th className="px-4 py-3">Total Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                  No attendance records yet.
                </td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id}>
                <td className="px-4 py-3">{new Date(record.clock_in_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">{new Date(record.clock_in_at).toLocaleTimeString()}</td>
                <td className="px-4 py-3">
                  {record.clock_out_at ? (
                    new Date(record.clock_out_at).toLocaleTimeString()
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Clocked in
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{attendanceHoursLabel(record.total_hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
