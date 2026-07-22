"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_STYLES,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  INTENT_LEVEL_STYLES,
  LEAD_CATEGORIES,
  LEAD_CATEGORY_STYLES,
  statusesForCategory,
  type ActiveCleaningOpportunityRow,
  type IntentLevel,
  type LeadCategory,
  type OpportunityCollectionRunRow,
  type OpportunityStatus,
  type OpportunityType,
} from "@/lib/opportunities/types";
import { REGIONS, regionForCity } from "@/lib/opportunities/cities";
import { buildCsv } from "@/lib/opportunities/csv";
import type { CrmUserRow } from "@/lib/crm-types";
import {
  archiveOpportunityAction,
  assignOpportunityAgentAction,
  bulkArchiveOpportunitiesAction,
  bulkDeleteOpportunitiesAction,
  deleteOpportunityAction,
  mergeOpportunitiesAction,
  restoreOpportunityAction,
  runCollectionNowAction,
  updateOpportunityStatusAction,
} from "./actions";

const INTENT_LEVELS: IntentLevel[] = ["Hot", "Warm", "Prospect"];

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function daysSinceDiscovered(dateDiscovered: string): number {
  const ms = new Date().getTime() - new Date(dateDiscovered).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function isExpiringSoon(opportunity: ActiveCleaningOpportunityRow): boolean {
  if (!opportunity.deadline || opportunity.archived_at) return false;
  if (["Expired", "Converted", "Not suitable"].includes(opportunity.status)) return false;
  const days = daysUntil(opportunity.deadline);
  return days >= 0 && days <= 7;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function OpportunitiesAdminClient({
  opportunities,
  agents,
  latestProspectRun,
}: {
  opportunities: ActiveCleaningOpportunityRow[];
  agents: CrmUserRow[];
  latestProspectRun: OpportunityCollectionRunRow | null;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<LeadCategory | "all">("all");
  const [cityFilter, setCityFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState<"all" | "BC" | "ON">("all");
  const [typeFilter, setTypeFilter] = useState<OpportunityType | "all">("all");
  const [intentFilter, setIntentFilter] = useState<IntentLevel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<OpportunityStatus | "all">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [deadlineFilter, setDeadlineFilter] = useState<"all" | "7" | "30" | "expired">("all");
  const [discoveredFilter, setDiscoveredFilter] = useState<"all" | "1" | "7" | "30">("all");
  const [archiveView, setArchiveView] = useState<"active" | "archived" | "all">("active");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Awaited<ReturnType<typeof runCollectionNowAction>> | null>(null);
  const [skipEmailForRun, setSkipEmailForRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, startRunTransition] = useTransition();
  const [isPending, startTransition] = useTransition();

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const activeOpportunities = useMemo(() => opportunities.filter((o) => !o.archived_at), [opportunities]);

  // Computed from currently-loaded records' current state, not an event
  // log - "assigned"/"contacted"/"quote requested" reflect each record's
  // status *right now*, not necessarily an action that happened today.
  // Duplicates-skipped and rejected-records figures aren't derivable here
  // at all (a rejected/duplicate candidate is never persisted - see
  // run.ts) - those only ever appear in the Collection Run panel above,
  // for whichever run produced them.
  const todayStats = useMemo(() => {
    const today = new Date();
    const isToday = (dateStr: string) => {
      const d = new Date(dateStr);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    };
    const discoveredToday = opportunities.filter((o) => isToday(o.date_discovered));
    const workedStatuses: OpportunityStatus[] = ["Contacted", "Follow-up required", "Quote requested", "Converted"];
    return {
      total: discoveredToday.length,
      newHot: discoveredToday.filter((o) => o.intent_level === "Hot").length,
      newWarm: discoveredToday.filter((o) => o.intent_level === "Warm").length,
      newProspects: discoveredToday.filter((o) => o.lead_category === "Qualified Prospect").length,
      withPhone: discoveredToday.filter((o) => o.public_phone).length,
      withEmail: discoveredToday.filter((o) => o.public_email).length,
      assigned: discoveredToday.filter((o) => o.assigned_agent).length,
      contacted: discoveredToday.filter((o) => workedStatuses.includes(o.status)).length,
      quoteRequested: discoveredToday.filter((o) => o.status === "Quote requested").length,
    };
  }, [opportunities]);

  const stats = [
    { label: "New Opportunities", value: activeOpportunities.filter((o) => o.status === "New").length },
    {
      label: "Hot",
      value: activeOpportunities.filter((o) => o.intent_level === "Hot").length,
      danger: true,
    },
    { label: "Warm", value: activeOpportunities.filter((o) => o.intent_level === "Warm").length, warn: true },
    {
      label: "Qualified Prospects",
      value: activeOpportunities.filter((o) => o.lead_category === "Qualified Prospect").length,
    },
    { label: "Expiring Soon", value: activeOpportunities.filter(isExpiringSoon).length, warn: true },
    { label: "Assigned", value: activeOpportunities.filter((o) => o.status === "Assigned").length },
  ];

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return opportunities.filter((o) => {
      if (archiveView === "active" && o.archived_at) return false;
      if (archiveView === "archived" && !o.archived_at) return false;
      if (categoryFilter !== "all" && o.lead_category !== categoryFilter) return false;
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
    archiveView,
    categoryFilter,
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

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((o) => o.id))));
  }

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  }

  function handleRunNow() {
    setRunResult(null);
    startRunTransition(async () => {
      const result = await runCollectionNowAction(skipEmailForRun);
      setRunResult(result);
    });
  }

  function handleBulkArchive() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Archive ${selectedIds.size} selected opportunity(ies)?`)) return;
    runAction(async () => {
      const result = await bulkArchiveOpportunitiesAction(Array.from(selectedIds));
      if (!result.error) setSelectedIds(new Set());
      return result;
    });
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Permanently delete ${selectedIds.size} selected opportunity(ies)? This cannot be undone - their notes and follow-ups will be removed too.`
      )
    )
      return;
    runAction(async () => {
      const result = await bulkDeleteOpportunitiesAction(Array.from(selectedIds));
      if (!result.error) setSelectedIds(new Set());
      return result;
    });
  }

  function handleMerge() {
    if (!mergePrimaryId) return;
    const duplicateIds = Array.from(selectedIds).filter((id) => id !== mergePrimaryId);
    if (duplicateIds.length === 0) {
      setError("Select at least one duplicate in addition to the primary record.");
      return;
    }
    const primaryTitle = opportunities.find((o) => o.id === mergePrimaryId)?.opportunity_title;
    if (
      !confirm(
        `Merge ${duplicateIds.length} record(s) into "${primaryTitle}"? Their notes and follow-ups will move to the primary record, and they'll be archived.`
      )
    )
      return;
    runAction(async () => {
      const result = await mergeOpportunitiesAction(mergePrimaryId, duplicateIds);
      if (!result.error) {
        setSelectedIds(new Set());
        setMergePrimaryId(null);
      }
      return result;
    });
  }

  function handleExportCsv() {
    const header = [
      "Category",
      "Industry",
      "Organization",
      "Opportunity Title",
      "City",
      "Province",
      "Address",
      "Service Needed",
      "Contact Name",
      "Public Phone",
      "Public Email",
      "Deadline",
      "Intent Level",
      "Intent Score",
      "Status",
      "Assigned Agent",
      "Last Follow-up Date",
      "Source",
      "Source URL",
      "Date Discovered",
      "Matched Cleaning Terms",
      "Accepted Reason",
      "Archived",
    ];
    const rows = filtered.map((o) => {
      const agent = o.assigned_agent ? agentById.get(o.assigned_agent) : null;
      return [
        o.lead_category,
        o.industry,
        o.organization_name,
        o.opportunity_title,
        o.city,
        o.province,
        o.address,
        o.service_needed,
        o.contact_name,
        o.public_phone,
        o.public_email,
        o.deadline,
        o.intent_level,
        o.intent_score,
        o.status,
        agent?.full_name || agent?.email || "",
        o.last_contacted_at,
        o.source_name,
        o.source_url,
        o.date_discovered,
        o.matched_cleaning_terms?.join("; ") ?? "",
        o.accepted_reason,
        o.archived_at ? "Yes" : "No",
      ];
    });
    downloadCsv(`cleaning-opportunities-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(header, rows));
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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

      <DailySummaryPanel stats={todayStats} />
      <LastSuccessfulSearchPanel run={latestProspectRun} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRunNow}
          disabled={isRunning}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {isRunning ? "Running collection..." : "Run Collection Now"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={skipEmailForRun}
            onChange={(e) => setSkipEmailForRun(e.target.checked)}
            disabled={isRunning}
          />
          Skip Hot-alert email for this run
        </label>
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400"
        >
          Export CSV ({filtered.length})
        </button>
      </div>
      {runResult?.error && <p className="mt-2 text-sm text-rose-600">Run failed: {runResult.error}</p>}
      {runResult?.summary && <RunSummaryPanel summary={runResult.summary} />}

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search organization, title, service..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <select
          value={archiveView}
          onChange={(e) => setArchiveView(e.target.value as typeof archiveView)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as LeadCategory | "all")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {LEAD_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
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

      {selectedIds.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <span className="text-sm font-medium text-sky-900">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={handleBulkArchive}
            disabled={isPending}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            Archive Selected
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isPending}
            className="rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:border-rose-400 disabled:opacity-50"
          >
            Delete Selected
          </button>
          <div className="flex items-center gap-2 border-l border-sky-200 pl-3">
            <select
              value={mergePrimaryId ?? ""}
              onChange={(e) => setMergePrimaryId(e.target.value || null)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Choose primary record...</option>
              {Array.from(selectedIds).map((id) => {
                const o = opportunities.find((opp) => opp.id === id);
                return (
                  <option key={id} value={id}>
                    {o?.organization_name || o?.opportunity_title || id}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={handleMerge}
              disabled={isPending || !mergePrimaryId || selectedIds.size < 2}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
            >
              Merge Into Primary
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs font-medium text-sky-700 hover:text-sky-900"
          >
            Clear selection
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Service Needed / Industry</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3">Intent</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Last Follow-up</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const agent = o.assigned_agent ? agentById.get(o.assigned_agent) : null;
              return (
                <tr
                  key={o.id}
                  className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${o.archived_at ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(o.id)}
                      onChange={() => toggleSelected(o.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${LEAD_CATEGORY_STYLES[o.lead_category]}`}
                    >
                      {o.lead_category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/admin/crm/opportunities/${o.id}`} className="hover:text-sky-600">
                      {o.organization_name || o.opportunity_title}
                    </Link>
                    {o.archived_at && <span className="ml-2 text-xs text-slate-400">(archived)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.city || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{o.service_needed || o.industry || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{o.contact_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{o.public_phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{o.public_email || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {o.deadline ? new Date(o.deadline).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${INTENT_LEVEL_STYLES[o.intent_level]}`}
                    >
                      {o.intent_level} ({o.intent_score})
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={o.status}
                      disabled={isPending || Boolean(o.archived_at)}
                      onChange={(e) =>
                        runAction(() => updateOpportunityStatusAction(o.id, e.target.value as OpportunityStatus))
                      }
                      className={`rounded-full border-none px-2.5 py-1 text-xs font-medium ${OPPORTUNITY_STATUS_STYLES[o.status]}`}
                    >
                      {statusesForCategory(o.lead_category).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={o.assigned_agent ?? ""}
                      disabled={isPending || Boolean(o.archived_at)}
                      onChange={(e) => runAction(() => assignOpportunityAgentAction(o.id, e.target.value || null))}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name || a.email}
                        </option>
                      ))}
                    </select>
                    {agent && <div className="mt-0.5 text-[10px] text-slate-400">Assigned to {agent.full_name || agent.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {o.last_contacted_at ? new Date(o.last_contacted_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/crm/opportunities/${o.id}`}
                        className="text-xs font-medium text-sky-600 hover:text-sky-700"
                      >
                        Details
                      </Link>
                      {o.archived_at ? (
                        <button
                          type="button"
                          onClick={() => runAction(() => restoreOpportunityAction(o.id))}
                          disabled={isPending}
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => runAction(() => archiveOpportunityAction(o.id))}
                          disabled={isPending}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
                        >
                          Archive
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              `Permanently delete "${o.organization_name || o.opportunity_title}"? This cannot be undone.`
                            )
                          ) {
                            runAction(() => deleteOpportunityAction(o.id));
                          }
                        }}
                        disabled={isPending}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-slate-500">
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

type RunCollectionSummary = NonNullable<
  Awaited<ReturnType<typeof runCollectionNowAction>>["summary"]
>;

// Shown after every "Run Collection Now" click - the exact breakdown the
// brief asks for: total candidates found (accepted + rejected, after
// in-run dedup), accepted vs. rejected, Active Opportunity vs. Qualified
// Prospect counts, Hot/Warm/Prospect/duplicate/expired counts, contact-info
// coverage, and a sample of rejected records with the reason each one
// didn't pass its connector's accept checks.
function RunSummaryPanel({ summary }: { summary: RunCollectionSummary }) {
  const acceptedCount = summary.newRecordsInserted + summary.duplicatesWithinRun + summary.duplicatesAlreadyStored;

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Collection Run — {new Date(summary.ranAt).toLocaleString()}
      </h3>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Candidates Found" value={summary.candidatesFound} />
        <SummaryStat label="Accepted" value={acceptedCount} />
        <SummaryStat label="Rejected" value={summary.rejectedCount} />
        <SummaryStat label="New Records Added" value={summary.newRecordsInserted} />
        <SummaryStat label="New Active Opportunities" value={summary.newActiveOpportunities} />
        <SummaryStat label="New Qualified Prospects" value={summary.newQualifiedProspects} />
        <SummaryStat label="Hot" value={summary.hotCount} />
        <SummaryStat label="Warm" value={summary.warmCount} />
        <SummaryStat label="Prospect" value={summary.prospectCount} />
        <SummaryStat
          label="Duplicates Skipped"
          value={summary.duplicatesWithinRun + summary.duplicatesAlreadyStored}
        />
        <SummaryStat label="With Phone" value={summary.withPhone} />
        <SummaryStat label="With Email" value={summary.withEmail} />
        <SummaryStat label="Expired at Discovery" value={summary.expiredAtDiscovery} />
        <SummaryStat label="Existing Records Expired" value={summary.expiredSwept} />
        <SummaryStat
          label="Hot Alerts"
          value={`${summary.hotAlertsSent} sent / ${summary.hotAlertsSkipped} skipped / ${summary.hotAlertErrors} failed`}
        />
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          By Source ({summary.connectors.length})
        </h4>
        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
          {summary.connectors.map((c) => (
            <li key={c.source_name}>
              {c.source_name}: {c.found} accepted, {c.rejectedCount} rejected
              {c.error ? ` — error: ${c.error}` : ""}
            </li>
          ))}
        </ul>
      </div>

      {summary.rejectedSamples.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Rejected Records ({summary.rejectedSamples.length} shown of {summary.rejectedCount})
          </h4>
          <ul className="mt-1 max-h-64 space-y-2 overflow-y-auto text-xs">
            {summary.rejectedSamples.map((r, i) => (
              <li key={i} className="border-t border-slate-100 pt-2 text-slate-600">
                <div className="font-medium text-slate-800">{r.opportunity_title}</div>
                <div className="text-slate-500">
                  {r.source_name} — {r.reason}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Accepted records now appear in the table above with their matched cleaning phrase and
        acceptance reason on each record&apos;s detail page.
      </p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}

type TodayStats = {
  total: number;
  newHot: number;
  newWarm: number;
  newProspects: number;
  withPhone: number;
  withEmail: number;
  assigned: number;
  contacted: number;
  quoteRequested: number;
};

// A persistent, always-visible daily digest (unlike the Collection Run
// panel above, which only appears right after a manual Run Collection Now
// click) - computed from today's discovered records' *current* state.
// Duplicates-skipped and rejected-records aren't included here since
// neither is ever persisted to the database (see run.ts) - those two
// figures only ever appear in the Collection Run panel for whichever run
// produced them.
function DailySummaryPanel({ stats }: { stats: TodayStats }) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Today&apos;s Summary — {stats.total} record{stats.total === 1 ? "" : "s"} discovered
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <SummaryStat label="New Hot" value={stats.newHot} />
        <SummaryStat label="New Warm" value={stats.newWarm} />
        <SummaryStat label="New Qualified Prospects" value={stats.newProspects} />
        <SummaryStat label="With Phone" value={stats.withPhone} />
        <SummaryStat label="With Email" value={stats.withEmail} />
        <SummaryStat label="Assigned" value={stats.assigned} />
        <SummaryStat label="Contacted" value={stats.contacted} />
        <SummaryStat label="Quote Requests Generated" value={stats.quoteRequested} />
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Duplicates skipped and rejected records for today&apos;s collection run(s) are shown in the
        Collection Run panel above, right after each Run Collection Now click - they&apos;re never
        stored, so they can&apos;t be tallied retroactively here.
      </p>
    </div>
  );
}

// Persisted summary of the qualified-prospects connector's most recent
// daily run (migration 0017's opportunity_collection_runs table) - unlike
// the ephemeral Collection Run panel above, this survives a page reload
// and reflects the cron's own runs, not just manual ones.
function LastSuccessfulSearchPanel({ run }: { run: OpportunityCollectionRunRow | null }) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Last Successful Search — Qualified Prospects (OpenStreetMap)
      </h3>

      {!run ? (
        <p className="mt-2 text-sm text-slate-500">No prospect collection run has been recorded yet.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-400">{new Date(run.ran_at).toLocaleString()}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Candidates Found" value={run.candidates_found} />
            <SummaryStat label="New Records Added" value={run.new_records_added} />
            <SummaryStat label="Duplicates Skipped" value={run.duplicates_skipped} />
            <SummaryStat label="Errors" value={run.errors.length} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Cities Searched ({run.cities_searched.length})
              </div>
              <div className="mt-0.5 text-xs text-slate-600">{run.cities_searched.join(", ") || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Industries Searched ({run.industries_searched.length})
              </div>
              <div className="mt-0.5 text-xs text-slate-600">{run.industries_searched.join(", ") || "—"}</div>
            </div>
          </div>
          {run.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-rose-600">
              {run.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Qualified Prospect business data includes information from{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-600"
        >
          OpenStreetMap
        </a>
        , made available under the Open Database License (ODbL). © OpenStreetMap contributors.
      </p>
    </div>
  );
}
