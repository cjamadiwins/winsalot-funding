"use client";

import { useMemo, useState } from "react";
import type { CrmAttendanceRow, CrmUserRow } from "@/lib/crm-types";
import { attendanceHoursLabel } from "@/lib/crm-types";

export default function AttendanceAdminClient({
  records,
  agents,
}: {
  records: CrmAttendanceRow[];
  agents: CrmUserRow[];
}) {
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const filtered = useMemo(() => {
    if (agentFilter === "all") return records;
    return records.filter((record) => record.agent_id === agentFilter);
  }, [records, agentFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700" htmlFor="attendance-agent-filter">
          Agent
        </label>
        <select
          id="attendance-agent-filter"
          value={agentFilter}
          onChange={(event) => setAgentFilter(event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.full_name || agent.email}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Clock In</th>
              <th className="px-4 py-3">Clock Out</th>
              <th className="px-4 py-3">Total Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No attendance records found.
                </td>
              </tr>
            )}
            {filtered.map((record) => {
              const agent = agentById.get(record.agent_id);
              return (
                <tr key={record.id}>
                  <td className="px-4 py-3">{agent?.full_name || agent?.email || "Unknown agent"}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
