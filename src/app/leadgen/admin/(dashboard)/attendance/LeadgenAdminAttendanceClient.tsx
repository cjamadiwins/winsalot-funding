"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import type { LeadgenAgentAttendanceRow, LeadgenUserRow } from "@/lib/leadgen-types";
import { LEADGEN_BOOKING_TIMEZONE, LEADGEN_BOOKING_TIMEZONE_LABEL } from "@/lib/leadgen-booking";
import {
  attendanceRecordStatus,
  ATTENDANCE_RECORD_STATUS_LABELS,
  computeCountdownState,
  computeShiftPayBreakdown,
  type AttendanceRecordStatus,
} from "@/lib/attendance-pay";
import {
  leadgenAdminClockOutAgentAction,
  correctLeadgenAttendanceRecordAction,
  setLeadgenAgentScheduledStartTimeAction,
  type LeadgenAdminClockOutState,
  type ActionResult,
} from "./actions";

function formatEasternTimestamp(iso: string) {
  const formatted = new Date(iso).toLocaleString("en-US", {
    timeZone: LEADGEN_BOOKING_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${formatted} ${LEADGEN_BOOKING_TIMEZONE_LABEL}`;
}

function formatDurationMinutes(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function minutesToHoursLabel(minutes: number) {
  return (minutes / 60).toFixed(2);
}

function toLocalDatetimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const RECORD_STATUS_STYLES: Record<AttendanceRecordStatus, string> = {
  clocked_in: "bg-emerald-100 text-emerald-800",
  on_break: "bg-sky-100 text-sky-800",
  present: "bg-slate-100 text-slate-700",
  late: "bg-amber-100 text-amber-800",
  early_departure: "bg-amber-100 text-amber-800",
  incomplete: "bg-rose-100 text-rose-700",
};

function RecordStatusBadge({ status }: { status: AttendanceRecordStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${RECORD_STATUS_STYLES[status]}`}>
      {ATTENDANCE_RECORD_STATUS_LABELS[status]}
    </span>
  );
}

function ClockOutAgentButton({ attendanceId }: { attendanceId: string }) {
  const initialState: LeadgenAdminClockOutState = { error: null };
  const [state, formAction, pending] = useActionState(leadgenAdminClockOutAgentAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Are you sure you want to clock out this agent?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="attendance_id" value={attendanceId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Clocking Out..." : "Clock Out Agent"}
      </button>
      {state.error && <p className="mt-1.5 max-w-[220px] text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

const CORRECTION_FIELDS = [
  { key: "clock_in", label: "Clock In" },
  { key: "clock_out", label: "Clock Out" },
  { key: "break1_start", label: "Break 1 Start" },
  { key: "break1_end", label: "Break 1 End" },
  { key: "lunch_start", label: "Lunch Start" },
  { key: "lunch_end", label: "Lunch End" },
  { key: "break2_start", label: "Break 2 Start" },
  { key: "break2_end", label: "Break 2 End" },
] as const;

function CorrectionForm({ row, onDone }: { row: LeadgenAgentAttendanceRow; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result: ActionResult = await correctLeadgenAttendanceRecordAction(formData);
          if (result.error) {
            setError(result.error);
            return;
          }
          onDone();
        });
      }}
      className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <input type="hidden" name="attendance_id" value={row.id} />
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Correct This Record</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CORRECTION_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="text-xs font-medium text-slate-600">{field.label}</label>
            <input
              type="datetime-local"
              name={field.key}
              defaultValue={toLocalDatetimeInputValue(row[field.key])}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
            />
          </div>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600">Reason for this correction (required)</label>
        <textarea
          name="reason"
          required
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Saving..." : "Save Correction"}
        </button>
        <button type="button" onClick={onDone} className="text-xs font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ScheduleEditor({ agent }: { agent: LeadgenUserRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(agent.scheduled_start_time?.slice(0, 5) ?? "");

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result: ActionResult = await setLeadgenAgentScheduledStartTimeAction(formData);
          if (result.error) setError(result.error);
        });
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="agent_id" value={agent.id} />
      <input
        type="time"
        name="scheduled_start_time"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-900"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save"}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </form>
  );
}

export default function LeadgenAdminAttendanceClient({
  attendance,
  agents,
}: {
  attendance: LeadgenAgentAttendanceRow[];
  agents: LeadgenUserRow[];
}) {
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [correctingId, setCorrectingId] = useState<string | null>(null);

  // Ticks once a second so the Live Status panel and every open row's
  // countdown stay current for the admin without a manual refresh -
  // "Admin should be able to see each agent's current status and
  // remaining break time."
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    return attendance.filter((row) => {
      if (agentFilter !== "all" && row.agent_id !== agentFilter) return false;
      if (dateFilter && row.attendance_date !== dateFilter) return false;
      return true;
    });
  }, [attendance, agentFilter, dateFilter]);

  const agentById = useMemo(() => {
    return new Map(agents.map((agent) => [agent.id, agent]));
  }, [agents]);

  const openRows = useMemo(() => attendance.filter((row) => !row.clock_out), [attendance]);

  const totalsByAgent = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const totals = new Map<string, { daily: number; weekly: number; monthly: number }>();
    for (const row of attendance) {
      if (row.total_minutes == null || !row.clock_out) continue;
      const clockInMs = new Date(row.clock_in).getTime();
      const existing = totals.get(row.agent_id) ?? { daily: 0, weekly: 0, monthly: 0 };
      if (row.attendance_date === todayKey) existing.daily += row.total_minutes;
      if (clockInMs >= weekStart.getTime()) existing.weekly += row.total_minutes;
      if (clockInMs >= monthStart.getTime()) existing.monthly += row.total_minutes;
      totals.set(row.agent_id, existing);
    }
    return totals;
  }, [attendance]);

  return (
    <div>
      <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
          >
            <option value="all">All agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.full_name || agent.email}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
          />
        </div>
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Live Status ({openRows.length} currently clocked in)
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {openRows.map((row) => {
          const agent = agentById.get(row.agent_id);
          const countdown = computeCountdownState(row, now);
          return (
            <div
              key={row.id}
              className={`rounded-xl border p-4 ${countdown?.isOverdue ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-[var(--crm-surface)]"}`}
            >
              <div className="font-medium text-slate-900">{agent?.full_name || row.agent_name}</div>
              <div className="mt-1 text-xs text-slate-500">Clocked in {formatEasternTimestamp(row.clock_in)}</div>
              {countdown && (
                <p className={`mt-2 text-sm font-semibold tabular-nums ${countdown.isOverdue ? "text-amber-800" : "text-slate-700"}`}>
                  {countdown.label}
                </p>
              )}
            </div>
          );
        })}
        {openRows.length === 0 && (
          <p className="text-sm text-slate-500">No agents are currently clocked in.</p>
        )}
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Scheduled Shift Start (for Late Arrival / Early Departure)
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
            <div className="font-medium text-slate-900">{agent.full_name || agent.email}</div>
            <div className="mt-2">
              <ScheduleEditor agent={agent} />
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Daily / Weekly / Monthly Hours by Agent
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const totals = totalsByAgent.get(agent.id) ?? { daily: 0, weekly: 0, monthly: 0 };
          return (
            <div key={agent.id} className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="font-medium text-slate-900">{agent.full_name || agent.email}</div>
              <div className="mt-2 text-sm text-slate-600">Daily: {minutesToHoursLabel(totals.daily)} h</div>
              <div className="text-sm text-slate-600">Weekly: {minutesToHoursLabel(totals.weekly)} h</div>
              <div className="text-sm text-slate-600">Monthly: {minutesToHoursLabel(totals.monthly)} h</div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 space-y-3">
        {filtered.map((row) => {
          const agent = agentById.get(row.agent_id);
          const scheduledStartTime = agent?.scheduled_start_time ?? null;
          const breakdown = computeShiftPayBreakdown(row, scheduledStartTime);
          const isToday = row.attendance_date === new Date().toISOString().slice(0, 10);
          const status = attendanceRecordStatus(row, breakdown, isToday);

          return (
            <div key={row.id} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{agent?.full_name || row.agent_name}</p>
                  <p className="text-xs text-slate-500">
                    {formatEasternTimestamp(row.clock_in)} →{" "}
                    {row.clock_out ? formatEasternTimestamp(row.clock_out) : "still clocked in"}
                  </p>
                </div>
                <RecordStatusBadge status={status} />
              </div>

              {!row.clock_out && (
                <p className="mt-2 text-sm font-semibold tabular-nums text-slate-700">
                  {computeCountdownState(row, now)?.label}
                </p>
              )}

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Total Shift Duration</dt>
                  <dd className="font-medium text-slate-800">{formatDurationMinutes(breakdown.totalMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Paid Working Hours</dt>
                  <dd className="font-medium text-slate-800">
                    {row.clock_out ? formatDurationMinutes(breakdown.paidWorkingMinutes) : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Unpaid Lunch Duration</dt>
                  <dd className="font-medium text-slate-800">{formatDurationMinutes(breakdown.lunchMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Paid Break Durations</dt>
                  <dd className="font-medium text-slate-800">
                    {formatDurationMinutes(breakdown.break1Minutes)} + {formatDurationMinutes(breakdown.break2Minutes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Late Arrival</dt>
                  <dd className="font-medium text-slate-800">
                    {breakdown.lateMinutes > 0 ? `${breakdown.lateMinutes}m` : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Early Departure</dt>
                  <dd className="font-medium text-slate-800">
                    {breakdown.earlyDepartureMinutes > 0 ? `${breakdown.earlyDepartureMinutes}m` : "-"}
                  </dd>
                </div>
                {row.clocked_out_by_admin_id && (
                  <div>
                    <dt className="text-slate-500">Clocked Out By</dt>
                    <dd className="font-medium text-slate-800">{row.clocked_out_by_admin_name || "an administrator"}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                {!row.clock_out && <ClockOutAgentButton attendanceId={row.id} />}
                <button
                  type="button"
                  onClick={() => setCorrectingId(correctingId === row.id ? null : row.id)}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800"
                >
                  {correctingId === row.id ? "Cancel Correction" : "Correct Record"}
                </button>
              </div>

              {correctingId === row.id && <CorrectionForm row={row} onDone={() => setCorrectingId(null)} />}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] px-4 py-8 text-center text-slate-500">
            No attendance records match your filters.
          </p>
        )}
      </div>
    </div>
  );
}
