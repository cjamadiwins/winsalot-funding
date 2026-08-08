"use client";

import { useActionState, useMemo, useState } from "react";
import type { LeadgenAgentAttendanceRow, LeadgenUserRow } from "@/lib/leadgen-types";
import { LEADGEN_BOOKING_TIMEZONE, LEADGEN_BOOKING_TIMEZONE_LABEL } from "@/lib/leadgen-booking";
import { leadgenAdminClockOutAgentAction, type LeadgenAdminClockOutState } from "./actions";

function formatHours(totalMinutes: number | null) {
  if (totalMinutes == null) return "-";
  return `${(totalMinutes / 60).toFixed(2)} h`;
}

function formatEasternTimestamp(iso: string) {
  const formatted = new Date(iso).toLocaleString("en-US", {
    timeZone: LEADGEN_BOOKING_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${formatted} ${LEADGEN_BOOKING_TIMEZONE_LABEL}`;
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

export default function LeadgenAdminAttendanceClient({
  attendance,
  agents,
}: {
  attendance: LeadgenAgentAttendanceRow[];
  agents: LeadgenUserRow[];
}) {
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

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

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[960px] text-left text-sm">
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
              const user = agentById.get(row.agent_id);
              const status = row.clock_out ? "Clocked Out" : "Clocked In";

              return (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">{user?.full_name || row.agent_name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.attendance_date}</td>
                  <td className="px-4 py-3 text-slate-600">{formatEasternTimestamp(row.clock_in)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.clock_out ? formatEasternTimestamp(row.clock_out) : "-"}
                    {row.clocked_out_by_admin_id && (
                      <div className="text-xs text-slate-400">
                        Clocked out by {row.clocked_out_by_admin_name || "an administrator"} (admin)
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatHours(row.total_minutes)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        row.clock_out ? "bg-slate-100 text-slate-700" : "bg-emerald-100 text-emerald-800"
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
