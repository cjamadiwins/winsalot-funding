"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Inbox,
  Clock,
  AlertTriangle,
  Hourglass,
  HardHat,
  FileCheck,
  Send,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  Trophy,
  XCircle,
} from "lucide-react";
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_STYLES,
  LEAD_STAGES,
  isOverdue,
  isDueToday,
  overdueDurationLabel,
  quoteFulfillmentStageLabel,
  quoteFulfillmentStageStyle,
  type CrmLeadRow,
  type CrmUserRow,
  type LeadStage,
} from "@/lib/crm-types";
import KpiCard, { type KpiTone } from "@/components/crm-ui/KpiCard";

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
  const [overdueOnly, setOverdueOnly] = useState(false);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const overdueLeads = useMemo(() => leads.filter(isOverdue), [leads]);

  // Each tile is a one-click filter view (requirement: dedicated admin
  // views/filters for all overdue leads and for each closing stage) -
  // clicking one sets stageFilter/overdueOnly directly rather than
  // requiring the admin to hunt for the right dropdown option. Every
  // tile now carries a fixed color (Quote Fulfillment color scheme) so
  // the row reads at a glance regardless of count.
  //
  // "Waiting on Customer" is now correctly wired to "Waiting for
  // cleaning details" - Winsalot waiting on the *customer* to provide
  // missing info - fixing a pre-existing mismap to "Quote sent to
  // customer" (which is actually "quote already sent, awaiting the
  // customer's accept/decline," a different stage, now its own "Quote
  // Sent to Customer" tile below).
  const stats: {
    label: string;
    value: number;
    tone: KpiTone;
    icon: typeof Inbox;
    stageValue?: LeadStage;
    isOverdueTile?: boolean;
  }[] = [
    {
      label: "New Quote Request",
      value: leads.filter((l) => l.stage === "New interested lead").length,
      stageValue: "New interested lead",
      tone: "blue",
      icon: Inbox,
    },
    { label: "Due Today", value: leads.filter(isDueToday).length, tone: "amber", icon: Clock },
    { label: "Overdue", value: overdueLeads.length, isOverdueTile: true, tone: "red", icon: AlertTriangle },
    {
      label: "Waiting on Customer",
      value: leads.filter((l) => l.stage === "Waiting for cleaning details").length,
      stageValue: "Waiting for cleaning details",
      tone: "orange",
      icon: Hourglass,
    },
    {
      label: "Waiting on Provider",
      value: leads.filter((l) => l.stage === "Quote requested from provider").length,
      stageValue: "Quote requested from provider",
      tone: "purple",
      icon: HardHat,
    },
    {
      label: "Quote Received",
      value: leads.filter((l) => l.stage === "Provider quote received").length,
      stageValue: "Provider quote received",
      tone: "teal",
      icon: FileCheck,
    },
    {
      label: "Quote Sent to Customer",
      value: leads.filter((l) => l.stage === "Quote sent to customer").length,
      stageValue: "Quote sent to customer",
      tone: "blue",
      icon: Send,
    },
    {
      label: "Customer Accepted",
      value: leads.filter((l) => l.stage === "Customer accepted").length,
      stageValue: "Customer accepted",
      tone: "green",
      icon: ThumbsUp,
    },
    {
      label: "Customer Declined",
      value: leads.filter((l) => l.stage === "Customer declined").length,
      stageValue: "Customer declined",
      tone: "rose",
      icon: ThumbsDown,
    },
    {
      label: "Job Completed",
      value: leads.filter((l) => l.stage === "Closed/completed").length,
      stageValue: "Closed/completed",
      tone: "green",
      icon: CheckCircle2,
    },
    {
      label: "Closed – Won",
      value: leads.filter((l) => l.stage === "Closed – Won").length,
      stageValue: "Closed – Won",
      tone: "green",
      icon: Trophy,
    },
    {
      label: "Closed – Lost",
      value: leads.filter((l) => l.stage === "Closed – Lost").length,
      stageValue: "Closed – Lost",
      tone: "rose",
      icon: XCircle,
    },
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

  const overdueByAgent = useMemo(() => {
    const groups = new Map<string, CrmLeadRow[]>();
    for (const lead of overdueLeads) {
      const key = lead.assigned_agent_id ?? "unassigned";
      const list = groups.get(key) ?? [];
      list.push(lead);
      groups.set(key, list);
    }
    return groups;
  }, [overdueLeads]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (overdueOnly && !isOverdue(lead)) return false;
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
  }, [leads, query, stageFilter, agentFilter, cityFilter, overdueOnly]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => {
          const clickable = Boolean(stat.stageValue || stat.isOverdueTile);
          const isActive = stat.isOverdueTile
            ? overdueOnly
            : stat.stageValue
              ? stageFilter === stat.stageValue
              : false;

          function handleClick() {
            if (stat.isOverdueTile) {
              setStageFilter("all");
              setOverdueOnly((v) => !v);
            } else if (stat.stageValue) {
              setOverdueOnly(false);
              setStageFilter((current) => (current === stat.stageValue ? "all" : stat.stageValue!));
            }
          }

          return (
            <KpiCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              tone={stat.tone}
              icon={<stat.icon />}
              onClick={clickable ? handleClick : undefined}
              active={isActive}
            />
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
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
              {quoteFulfillmentStageLabel(stage)}
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
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          Overdue only
        </label>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
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
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${quoteFulfillmentStageStyle(lead.stage)}`}
                    >
                      {quoteFulfillmentStageLabel(lead.stage)}
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
                    {isOverdue(lead) && lead.next_follow_up_at && (
                      <div className="text-xs font-normal">
                        {overdueDurationLabel(lead.next_follow_up_at)}
                      </div>
                    )}
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
        Leads by Agent — Overdue by Agent
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const overdueCount = (overdueByAgent.get(agent.id) ?? []).length;
          return (
            <div
              key={agent.id}
              className={`rounded-xl border p-4 ${
                overdueCount > 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-[var(--crm-surface)]"
              }`}
            >
              <div className="font-medium text-slate-900">{agent.full_name || agent.email}</div>
              <div className="text-sm text-slate-500">
                {(byAgent.get(agent.id) ?? []).length} lead
                {(byAgent.get(agent.id) ?? []).length === 1 ? "" : "s"}
                {overdueCount > 0 && (
                  <span className="ml-1.5 font-semibold text-rose-700">
                    · {overdueCount} overdue
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {(byAgent.get("unassigned") ?? []).length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
            <div className="font-medium text-slate-900">Unassigned</div>
            <div className="text-sm text-slate-500">{byAgent.get("unassigned")!.length} leads</div>
          </div>
        )}
      </div>
    </div>
  );
}
