"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_STYLES,
  LEAD_STAGES,
  LEAD_STAGE_STYLES,
  isOverdue,
  isDueToday,
  type CrmLeadRow,
  type CrmUserRow,
  type LeadStage,
} from "@/lib/crm-types";

export default function AdminCrmClient({
  leads,
  agents,
}: {
  leads: CrmLeadRow[];
  agents: CrmUserRow[];
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState("");

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const stats = [
    { label: "New Leads", value: leads.filter((l) => l.stage === "New interested lead").length },
    { label: "Due Today", value: leads.filter(isDueToday).length, warn: true },
    { label: "Overdue", value: leads.filter(isOverdue).length, danger: true },
    {
      label: "Waiting on Provider",
      value: leads.filter((l) => l.stage === "Quote requested from provider").length,
    },
    {
      label: "Waiting on Customer",
      value: leads.filter((l) => l.stage === "Quote sent to customer").length,
    },
    { label: "Accepted", value: leads.filter((l) => l.stage === "Customer accepted").length },
    { label: "Declined", value: leads.filter((l) => l.stage === "Customer declined").length },
    { label: "Closed", value: leads.filter((l) => l.stage === "Closed/completed").length },
  ];

  const byAgent = useMemo(() => {
    const groups = new Map<string, CrmLeadRow[]>();
    for (const lead of leads) {
      const key = lead.assigned_agent_id ?? "unassigned";
      const list = groups.get(key) ?? [];
      list.push(lead);
      groups.set(key, list);
    }
    return groups;
  }, [leads]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (stageFilter !== "all" && lead.stage !== stageFilter) return false;
      if (agentFilter !== "all" && (lead.assigned_agent_id ?? "unassigned") !== agentFilter) {
        return false;
      }
      if (cityFilter && !lead.city.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (!query) return true;
      return (
        lead.business_name.toLowerCase().includes(query) ||
        (lead.contact_name ?? "").toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        (lead.email ?? "").toLowerCase().includes(query)
      );
    });
  }, [leads, query, stageFilter, agentFilter, cityFilter]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-xl border p-4 ${
              stat.danger && stat.value > 0
                ? "border-rose-200 bg-rose-50"
                : stat.warn && stat.value > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-slate-200 bg-white"
            }`}
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
              {stat.label}
            </div>
            <div
              className={`mt-1 text-xl font-bold ${
                stat.danger && stat.value > 0 ? "text-rose-700" : "text-slate-900"
              }`}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <input
          type="text"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          placeholder="City"
          className="w-full max-w-[160px] rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as LeadStage | "all")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All stages</option>
          {LEAD_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All agents</option>
          <option value="unassigned">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.full_name || agent.email}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Email Status</th>
              <th className="px-4 py-3">Next Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => {
              const agent = lead.assigned_agent_id ? agentById.get(lead.assigned_agent_id) : null;
              const bounced = lead.last_email_status === "bounced" || lead.last_email_status === "complained";
              return (
                <tr
                  key={lead.id}
                  className={`border-b border-slate-100 last:border-0 ${
                    bounced ? "bg-rose-50" : isOverdue(lead) ? "bg-rose-50" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/admin/crm/leads/${lead.id}`} className="hover:text-sky-600">
                      {lead.business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.city}</td>
                  <td className="px-4 py-3 text-slate-600">{agent?.full_name || agent?.email || "Unassigned"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${LEAD_STAGE_STYLES[lead.stage]}`}
                    >
                      {lead.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.last_email_status ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${EMAIL_STATUS_STYLES[lead.last_email_status]}`}
                      >
                        {EMAIL_STATUS_LABELS[lead.last_email_status]}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 ${isOverdue(lead) ? "font-semibold text-rose-700" : "text-slate-600"}`}>
                    {lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No leads match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Leads by Agent
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-medium text-slate-900">{agent.full_name || agent.email}</div>
            <div className="text-sm text-slate-500">
              {(byAgent.get(agent.id) ?? []).length} lead
              {(byAgent.get(agent.id) ?? []).length === 1 ? "" : "s"}
            </div>
          </div>
        ))}
        {(byAgent.get("unassigned") ?? []).length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-medium text-slate-900">Unassigned</div>
            <div className="text-sm text-slate-500">{byAgent.get("unassigned")!.length} leads</div>
          </div>
        )}
      </div>
    </div>
  );
}
