"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  isFollowUpDueToday,
  isFollowUpOverdue,
  isFollowUpUpcoming,
  type CrmFollowUpWithLead,
  type CrmUserRow,
} from "@/lib/crm-types";

// Read-only by design: admins can view every agent's scheduled callbacks
// here, but managing an individual callback (complete/reschedule) happens
// from that agent's own workflow or the lead's own page - this view is
// for oversight, not day-to-day callback management.
export default function AdminFollowUps({
  followUps,
  agents,
}: {
  followUps: CrmFollowUpWithLead[];
  agents: CrmUserRow[];
}) {
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const filtered = useMemo(() => {
    if (agentFilter === "all") return followUps;
    return followUps.filter((f) => f.crm_leads?.assigned_agent_id === agentFilter);
  }, [followUps, agentFilter]);

  const overdue = filtered.filter(isFollowUpOverdue);
  const today = filtered.filter(isFollowUpDueToday);
  const upcoming = filtered.filter(isFollowUpUpcoming);

  return (
    <div>
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

      <Group title="Overdue" items={overdue} emphasis="danger" agentById={agentById} />
      <Group title="Today" items={today} emphasis="warn" agentById={agentById} />
      <Group title="Upcoming" items={upcoming} emphasis="none" agentById={agentById} />

      {filtered.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No scheduled callbacks match this filter.</p>
      )}
    </div>
  );
}

function Group({
  title,
  items,
  emphasis,
  agentById,
}: {
  title: string;
  items: CrmFollowUpWithLead[];
  emphasis: "danger" | "warn" | "none";
  agentById: Map<string, CrmUserRow>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-5">
      <h3
        className={`text-xs font-semibold uppercase tracking-wide ${
          emphasis === "danger" ? "text-rose-700" : emphasis === "warn" ? "text-amber-700" : "text-slate-500"
        }`}
      >
        {title} ({items.length})
      </h3>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((followUp) => {
              const agent = followUp.crm_leads?.assigned_agent_id
                ? agentById.get(followUp.crm_leads.assigned_agent_id)
                : null;
              return (
                <tr
                  key={followUp.id}
                  className={`border-b border-slate-100 last:border-0 ${
                    emphasis === "danger" ? "bg-rose-50" : ""
                  }`}
                >
                  <td className={`px-4 py-3 ${emphasis === "danger" ? "font-semibold text-rose-700" : "text-slate-600"}`}>
                    {new Date(followUp.scheduled_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {followUp.crm_leads ? (
                      <Link
                        href={`/admin/crm/leads/${followUp.crm_leads.id}`}
                        className="hover:text-sky-600"
                      >
                        {followUp.crm_leads.business_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{agent?.full_name || agent?.email || "Unassigned"}</td>
                  <td className="px-4 py-3 text-slate-600">{followUp.note || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
