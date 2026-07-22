"use client";

import { useMemo, useState, useTransition } from "react";
import {
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_STYLES,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  INTENT_LEVEL_STYLES,
  type ActiveCleaningOpportunityRow,
  type IntentLevel,
  type OpportunityStatus,
  type OpportunityType,
} from "@/lib/opportunities/types";
import { REGIONS, regionForCity } from "@/lib/opportunities/cities";
import type { CrmUserRow } from "@/lib/crm-types";
import {
  addOpportunityNoteAction,
  assignOpportunityAgentAction,
  runCollectionNowAction,
  updateOpportunityStatusAction,
} from "./actions";

const INTENT_LEVELS: IntentLevel[] = ["Hot", "Warm", "Research"];

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function isExpiringSoon(opportunity: ActiveCleaningOpportunityRow): boolean {
  if (!opportunity.deadline) return false;
  if (["Expired", "Converted", "Not suitable"].includes(opportunity.status)) return false;
  const days = daysUntil(opportunity.deadline);
  return days >= 0 && days <= 7;
}

function daysSinceDiscovered(dateDiscovered: string): number {
  const ms = new Date().getTime() - new Date(dateDiscovered).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export default function OpportunitiesClient({
  opportunities,
  agents,
}: {
  opportunities: ActiveCleaningOpportunityRow[];
  agents: CrmUserRow[];
}) {
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState<"all" | "BC" | "ON">("all");
  const [typeFilter, setTypeFilter] = useState<OpportunityType | "all">("all");
  const [intentFilter, setIntentFilter] = useState<IntentLevel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<OpportunityStatus | "all">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [deadlineFilter, setDeadlineFilter] = useState<"all" | "7" | "30" | "expired">("all");
  const [discoveredFilter, setDiscoveredFilter] = useState<"all" | "1" | "7" | "30">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [isRunning, startRunTransition] = useTransition();

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const stats = [
    { label: "New Opportunities", value: opportunities.filter((o) => o.status === "New").length },
    {
      label: "Hot Opportunities",
      value: opportunities.filter((o) => o.intent_level === "Hot").length,
      danger: true,
    },
    { label: "Warm Opportunities", value: opportunities.filter((o) => o.intent_level === "Warm").length, warn: true },
    { label: "Expiring Soon", value: opportunities.filter(isExpiringSoon).length, warn: true },
    { label: "Assigned", value: opportunities.filter((o) => o.status === "Assigned").length },
  ];

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return opportunities.filter((o) => {
      if (cityFilter && (o.city ?? "").toLowerCase() !== cityFilter.toLowerCase()) return false;
      if (regionFilter !== "all" && regionForCity(o.city) !== regionFilter) return false;
      if (provinceFilter !== "all" && o.province !== provinceFilter) return false;
      if (typeFilter !== "all" && o.opportunity_type !== typeFilter) return false;
      if (intentFilter !== "all" && o.intent_level !== intentFilter) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (agentFilter !== "all" && (o.assigned_agent ?? "unassigned") !== agentFilter) return false;

      if (deadlineFilter !== "all") {
        if (!o.deadline) return false;
        const days = daysUntil(o.deadline);
        if (deadlineFilter === "expired" && days >= 0) return false;
        if (deadlineFilter === "7" && !(days >= 0 && days <= 7)) return false;
        if (deadlineFilter === "30" && !(days >= 0 && days <= 30)) return false;
      }

      if (discoveredFilter !== "all") {
        const days = daysSinceDiscovered(o.date_discovered);
        if (discoveredFilter === "1" && days > 1) return false;
        if (discoveredFilter === "7" && days > 7) return false;
        if (discoveredFilter === "30" && days > 30) return false;
      }

      if (!query) return true;
      return (
        (o.organization_name ?? "").toLowerCase().includes(query) ||
        o.opportunity_title.toLowerCase().includes(query) ||
        (o.service_needed ?? "").toLowerCase().includes(query)
      );
    });
  }, [
    opportunities,
    query,
    cityFilter,
    regionFilter,
    provinceFilter,
    typeFilter,
    intentFilter,
    statusFilter,
    agentFilter,
    deadlineFilter,
    discoveredFilter,
  ]);

  const cities = useMemo(
    () => Array.from(new Set(opportunities.map((o) => o.city).filter((c): c is string => Boolean(c)))).sort(),
    [opportunities]
  );

  function handleRunNow() {
    setRunResult(null);
    startRunTransition(async () => {
      const result = await runCollectionNowAction();
      if (result.error) {
        setRunResult(`Failed: ${result.error}`);
      } else if (result.summary) {
        setRunResult(
          `Found ${result.summary.candidatesFound} candidates, added ${result.summary.newRecordsInserted} new (${result.summary.hotAlertsSent} Hot alerts sent).`
        );
      }
    });
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRunNow}
          disabled={isRunning}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {isRunning ? "Running collection..." : "Run Collection Now"}
        </button>
        {runResult && <span className="text-sm text-slate-600">{runResult}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search organization, title, service..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="">All cities</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All regions</option>
          {REGIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
        <select
          value={provinceFilter}
          onChange={(e) => setProvinceFilter(e.target.value as "all" | "BC" | "ON")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All provinces</option>
          <option value="BC">British Columbia</option>
          <option value="ON">Ontario</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as OpportunityType | "all")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All types</option>
          {OPPORTUNITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {OPPORTUNITY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          value={intentFilter}
          onChange={(e) => setIntentFilter(e.target.value as IntentLevel | "all")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All intent levels</option>
          {INTENT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OpportunityStatus | "all")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {OPPORTUNITY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
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
        <select
          value={deadlineFilter}
          onChange={(e) => setDeadlineFilter(e.target.value as typeof deadlineFilter)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">Any deadline</option>
          <option value="7">Due within 7 days</option>
          <option value="30">Due within 30 days</option>
          <option value="expired">Deadline passed</option>
        </select>
        <select
          value={discoveredFilter}
          onChange={(e) => setDiscoveredFilter(e.target.value as typeof discoveredFilter)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">Any discovery date</option>
          <option value="1">Discovered today</option>
          <option value="7">Discovered this week</option>
          <option value="30">Discovered this month</option>
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Posted</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3">Intent</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((opportunity) => (
              <OpportunityRow
                key={opportunity.id}
                opportunity={opportunity}
                agents={agents}
                agentById={agentById}
                expanded={expandedId === opportunity.id}
                onToggle={() => setExpandedId(expandedId === opportunity.id ? null : opportunity.id)}
              />
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  No opportunities match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpportunityRow({
  opportunity,
  agents,
  agentById,
  expanded,
  onToggle,
}: {
  opportunity: ActiveCleaningOpportunityRow;
  agents: CrmUserRow[];
  agentById: Map<string, CrmUserRow>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const agent = opportunity.assigned_agent ? agentById.get(opportunity.assigned_agent) : null;

  function setStatus(status: OpportunityStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateOpportunityStatusAction(opportunity.id, status);
      if (result.error) setError(result.error);
    });
  }

  function setAgent(agentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await assignOpportunityAgentAction(opportunity.id, agentId === "" ? null : agentId);
      if (result.error) setError(result.error);
    });
  }

  function submitNote() {
    if (!noteText.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addOpportunityNoteAction(opportunity.id, noteText);
      if (result.error) setError(result.error);
      else setNoteText("");
    });
  }

  return (
    <>
      <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
        <td className="px-4 py-3 font-medium text-slate-900">
          {opportunity.organization_name || "Unknown organization"}
          <div className="text-xs font-normal text-slate-500">{opportunity.opportunity_title}</div>
        </td>
        <td className="px-4 py-3 text-slate-600">{opportunity.service_needed || "—"}</td>
        <td className="px-4 py-3 text-slate-600">
          {[opportunity.city, opportunity.province].filter(Boolean).join(", ") || "—"}
        </td>
        <td className="px-4 py-3 text-slate-500">
          {opportunity.date_posted ? new Date(opportunity.date_posted).toLocaleDateString() : "—"}
        </td>
        <td className="px-4 py-3 text-slate-500">
          {opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString() : "—"}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${INTENT_LEVEL_STYLES[opportunity.intent_level]}`}
          >
            {opportunity.intent_level} ({opportunity.intent_score})
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${OPPORTUNITY_STATUS_STYLES[opportunity.status]}`}
          >
            {opportunity.status}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-600">{agent?.full_name || agent?.email || "Unassigned"}</td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs font-medium text-sky-600 hover:text-sky-700"
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={9} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {opportunity.description && (
                  <p className="text-sm text-slate-700">{opportunity.description}</p>
                )}

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-400">Contact</dt>
                    <dd>{opportunity.contact_name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-400">Email</dt>
                    <dd>{opportunity.public_email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
                    <dd>{opportunity.public_phone || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-400">Source</dt>
                    <dd>{opportunity.source_name}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-400">Discovered</dt>
                    <dd>{new Date(opportunity.date_discovered).toLocaleDateString()}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-400">Website</dt>
                    <dd className="truncate">{opportunity.website || "—"}</dd>
                  </div>
                </dl>

                <a
                  href={opportunity.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400"
                >
                  Open Original Source
                </a>

                {opportunity.notes && (
                  <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 font-sans text-xs text-slate-600">
                    {opportunity.notes}
                  </pre>
                )}

                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a follow-up note..."
                    className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={submitNote}
                    disabled={isPending || !noteText.trim()}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
                  >
                    Add Note
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Assign to Agent
                </label>
                <select
                  value={opportunity.assigned_agent ?? ""}
                  onChange={(e) => setAgent(e.target.value)}
                  disabled={isPending}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name || a.email}
                    </option>
                  ))}
                </select>

                <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </label>
                <select
                  value={opportunity.status}
                  onChange={(e) => setStatus(e.target.value as OpportunityStatus)}
                  disabled={isPending}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  {OPPORTUNITY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("Contacted")}
                    disabled={isPending}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
                  >
                    Mark Contacted
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("Converted")}
                    disabled={isPending}
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:border-emerald-400 disabled:opacity-50"
                  >
                    Mark Converted
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("Not suitable")}
                    disabled={isPending}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 hover:border-slate-400 disabled:opacity-50"
                  >
                    Not Suitable
                  </button>
                </div>

                {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
