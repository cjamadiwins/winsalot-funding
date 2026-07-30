"use client";

import { useMemo, useState } from "react";
import type { LeadgenAgentAttendanceRow, LeadgenUserRow } from "@/lib/leadgen-types";

function formatHours(totalMinutes: number | null) {
  if (totalMinutes == null) return "-";
  return `${(totalMinutes / 60).toFixed(2)} h`;
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
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
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

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Clock In</th>
              <th className="px-4 py-3">Clock Out</th>
              <th className="px-4 py-3">Total Hours</th>
              <th className="px-4 py-3">Status</th>
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
                  <td className="px-4 py-3 text-slate-600">{new Date(row.clock_in).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-600">{row.clock_out ? new Date(row.clock_out).toLocaleString() : "-"}</td>
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
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
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