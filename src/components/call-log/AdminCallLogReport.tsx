"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import {
  CALL_LOG_OUTCOMES,
  CALL_LOG_OUTCOME_STYLES,
  CALL_LOG_PAGE_SIZE_OPTIONS,
  formatCallLogDate,
  type CallLogRow,
} from "@/lib/call-log";
import CallLogDetailModal, { type CallLogDetailEntry } from "./CallLogDetailModal";

export type AdminCallLogEntry = CallLogRow & { agentName: string };
export type AdminCallLogAgent = { id: string; name: string };
export type AdminCallLogBusinessClientFilter = {
  options: { id: string; name: string }[];
  selected: string;
};
export type AdminCallLogClientVisibleNote = {
  updateAction: (logId: string, note: string) => Promise<{ error?: string }>;
};
export type AdminCallLogFilters = {
  search: string;
  agent: string;
  outcome: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
};

type Props = {
  title: string;
  backHref: string;
  // Route handler that streams the CSV - each CRM's own
  // .../call-notes/export/route.ts. Filters are appended as query params
  // by this component, matching exactly what the list itself is showing.
  exportBaseHref: string;
  // Only this page's rows (server-side paginated) - never the full table,
  // however many thousands of rows the CRM eventually holds.
  entries: AdminCallLogEntry[];
  totalCount: number;
  agents: AdminCallLogAgent[];
  filters: AdminCallLogFilters;
  errorMessage?: string | null;
  // Only the Lead Generation CRM (multiple clients) gets this filter -
  // the Growth CRM's Business/Client is always "Winsalot Corp." on every
  // row, so filtering by it would never narrow anything.
  businessClientFilter?: AdminCallLogBusinessClientFilter;
  // Only the Lead Generation CRM passes this - its leadgen_call_logs table
  // has a client_visible_note column and a Client Portal that reads it
  // (src/app/client/(portal)/call-activity/page.tsx); the Growth CRM's
  // crm_call_logs has no such column, so this column is omitted there
  // entirely rather than shown disabled/empty.
  clientVisibleNote?: AdminCallLogClientVisibleNote;
};

export default function AdminCallLogReport({
  title,
  backHref,
  exportBaseHref,
  entries,
  totalCount,
  agents,
  filters,
  errorMessage,
  businessClientFilter,
  clientVisibleNote,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<CallLogDetailEntry | null>(null);
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync when the URL's own `q` changes from outside this
  // input (a "Clear filters" click, browser back/forward) - adjusted during
  // render itself, same pattern as RowsPerPagePager's page reset, rather
  // than a useEffect, which would cost an extra render and trip the
  // set-state-in-effect lint rule.
  const [syncedSearch, setSyncedSearch] = useState(filters.search);
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search);
    setSearchInput(filters.search);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const pageSize = filters.pageSize;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(filters.page, 1), pageCount);
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  function updateParams(patch: Record<string, string>, opts?: { resetPage?: boolean }) {
    const next = new URLSearchParams();
    const agent = patch.agent ?? filters.agent;
    const client = patch.client ?? businessClientFilter?.selected ?? "all";
    const outcome = patch.outcome ?? filters.outcome;
    const q = patch.q ?? filters.search;
    const from = patch.from ?? filters.from;
    const to = patch.to ?? filters.to;
    const size = patch.pageSize ?? String(pageSize);
    const nextPage = opts?.resetPage ? "1" : patch.page ?? String(page);

    if (agent !== "all") next.set("agent", agent);
    if (businessClientFilter && client !== "all") next.set("client", client);
    if (outcome !== "all") next.set("outcome", outcome);
    if (q) next.set("q", q);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    next.set("pageSize", size);
    next.set("page", nextPage);

    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParams({ q: value }, { resetPage: true }), 350);
  }

  function exportHref(scope: "filtered" | "all") {
    const params = new URLSearchParams();
    params.set("scope", scope);
    if (scope === "filtered") {
      if (filters.agent !== "all") params.set("agent", filters.agent);
      if (businessClientFilter && businessClientFilter.selected !== "all") params.set("client", businessClientFilter.selected);
      if (filters.outcome !== "all") params.set("outcome", filters.outcome);
      if (filters.search) params.set("q", filters.search);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
    }
    return `${exportBaseHref}?${params.toString()}`;
  }

  function resetFilters() {
    router.push(pathname, { scroll: false });
  }

  const hasActiveFilters =
    filters.agent !== "all" ||
    filters.outcome !== "all" ||
    Boolean(filters.search) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    (businessClientFilter ? businessClientFilter.selected !== "all" : false);

  return (
    <div>
      <Link href={backHref} className="text-sm font-semibold text-sky-700 hover:text-sky-800">
        ← Back to Agent Performance
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review every call that did not need to be added as a lead or opportunity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
            {totalCount} call{totalCount === 1 ? "" : "s"}
          </div>
          <a
            href={exportHref("filtered")}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Export Filtered
          </a>
          <a
            href={exportHref("all")}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Download className="h-4 w-4" /> Export All Call Logs
          </a>
        </div>
      </div>

      <div
        className={`mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 ${
          businessClientFilter ? "sm:grid-cols-2 lg:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-5"
        }`}
      >
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 lg:col-span-2">
          Search
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Business name or phone number"
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm font-normal normal-case text-slate-900"
            />
          </div>
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Agent
          <select
            value={filters.agent}
            onChange={(event) => updateParams({ agent: event.target.value }, { resetPage: true })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900"
          >
            <option value="all">All agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>

        {businessClientFilter ? (
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Business / Client
            <select
              value={businessClientFilter.selected}
              onChange={(event) => updateParams({ client: event.target.value }, { resetPage: true })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900"
            >
              <option value="all">All clients</option>
              {businessClientFilter.options.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Call Result
          <select
            value={filters.outcome}
            onChange={(event) => updateParams({ outcome: event.target.value }, { resetPage: true })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900"
          >
            <option value="all">All results</option>
            {CALL_LOG_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {outcome}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          From
          <input
            type="date"
            value={filters.from}
            onChange={(event) => updateParams({ from: event.target.value }, { resetPage: true })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900"
          />
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          To
          <input
            type="date"
            value={filters.to}
            onChange={(event) => updateParams({ to: event.target.value }, { resetPage: true })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900"
          />
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="self-end text-xs font-semibold text-slate-500 hover:text-slate-700 lg:col-span-1"
          >
            Clear filters
          </button>
        )}
      </div>

      {errorMessage ? (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Call logs could not be loaded: {errorMessage}
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-5 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No call logs match these filters.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Business / Client</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => setSelected(entry)}
                  className="cursor-pointer align-top hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatCallLogDate(entry.created_at)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{entry.business_name}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.businessClient}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{entry.agentName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${CALL_LOG_OUTCOME_STYLES[entry.outcome]}`}>
                      {entry.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(entry);
                      }}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-slate-600">
        <span>{totalCount === 0 ? "No calls" : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            Rows per page
            <select
              value={pageSize}
              onChange={(event) => updateParams({ pageSize: event.target.value }, { resetPage: true })}
              className="rounded-lg border border-slate-300 px-2 py-1 text-[12.5px]"
            >
              {CALL_LOG_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
              aria-label="Previous page"
              className="rounded-full border border-slate-300 p-1.5 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[64px] text-center font-medium text-slate-700">
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => updateParams({ page: String(page + 1) })}
              aria-label="Next page"
              className="rounded-full border border-slate-300 p-1.5 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {selected && (
        <CallLogDetailModal
          entry={selected}
          onClose={() => setSelected(null)}
          clientVisibleNote={clientVisibleNote}
        />
      )}
    </div>
  );
}
