"use client";

import { useActionState, useMemo, useState } from "react";
import type { AgentAttendanceRow, CrmUserRow } from "@/lib/crm-types";
import { adminClockOutAgentAction, type AdminClockOutState } from "./actions";

type StatusFilter = "all" | "clocked_in" | "clocked_out";

function localDateKey(value: string) {
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function minutesToHoursLabel(minutes: number) {
  return (minutes / 60).toFixed(2);
}

function ClockOutAgentButton({ attendanceId }: { attendanceId: string }) {
  const initialState: AdminClockOutState = { error: null };
  const [state, formAction, pending] = useActionState(adminClockOutAgentAction, initialState);

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
        {pending ? "Clocking Out..." : "Admin Clock Out"}
      </button>
      {state.error && <p className="mt-1.5 max-w-[220px] text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

export default function AdminAttendanceClient({
  attendance,
  agents,
}: {
  attendance: AgentAttendanceRow[];
  agents: CrmUserRow[];
}) {
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const filtered = useMemo(() => {
    return attendance.filter((row) => {
      if (agentFilter !== "all" && row.agent_id !== agentFilter) return false;
      if (statusFilter === "clocked_in" && row.clock_out) return false;
      if (statusFilter === "clocked_out" && !row.clock_out) return false;
      if (dateFilter && localDateKey(row.clock_in) !== dateFilter) return false;
      return true;
    });
  }, [attendance, agentFilter, statusFilter, dateFilter]);

  const totalsByAgent = useMemo(() => {
    const now = new Date();
    const dayStart = startOfDay(now).getTime();
    const weekStart = startOfWeek(now).getTime();
    const monthStart = startOfMonth(now).getTime();

    const totals = new Map<string, { daily: number; weekly: number; monthly: number }>();

    for (const row of attendance) {
      if (row.total_minutes == null || !row.clock_out) continue;
      const clockInMs = new Date(row.clock_in).getTime();

      const existing = totals.get(row.agent_id) ?? { daily: 0, weekly: 0, monthly: 0 };

      if (clockInMs >= dayStart) {
        existing.daily += row.total_minutes;
      }
      if (clockInMs >= weekStart) {
        existing.weekly += row.total_minutes;
      }
      if (clockInMs >= monthStart) {
        existing.monthly += row.total_minutes;
      }

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
            onChange={(e) => setAgentFilter(e.target.value)}
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
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
          >
            <option value="all">All status</option>
            <option value="clocked_in">Clocked In</option>
            <option value="clocked_out">Clocked Out</option>
          </select>
        </div>
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

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Clock In</th>
              <th className="px-4 py-3">Clock Out</th>
              <th className="px-4 py-3">Total Hours</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const agent = agentById.get(row.agent_id);
              const status = row.clock_out ? "Clocked Out" : "Clocked In";
              return (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">{agent?.full_name || agent?.email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(row.clock_in).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(row.clock_in).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.clock_out ? new Date(row.clock_out).toLocaleString() : "-"}
                    {row.clocked_out_by_admin_id && (
                      <div className="text-xs text-slate-400">
                        Clocked out by {row.clocked_out_by_admin_name || "an administrator"} (admin)
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.total_minutes == null ? "-" : `${minutesToHoursLabel(row.total_minutes)} h`}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        row.clock_out
                          ? "bg-slate-100 text-slate-700"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{!row.clock_out && <ClockOutAgentButton attendanceId={row.id} />}</td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No attendance records match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
