"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  LEADGEN_LEAD_STATUSES,
  LEADGEN_LEAD_STATUS_STYLES,
  isLeadgenNextFollowUpDueToday,
  isLeadgenNextFollowUpOverdue,
  type LeadgenAppointmentStatus,
  type LeadgenEmailStatus,
  type LeadgenLeadRow,
  type LeadgenLeadStatus,
} from "@/lib/leadgen-types";

// Compact filter-bar controls, matching the admin Leads table's tighter
// sizing (LeadsListClient) so the filter row doesn't eat up vertical
// space on desktop.
const filterInputClass = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] text-slate-900";

type FollowUpFilter = "all" | "due_today" | "overdue";
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export default function AgentLeadsListClient({
  leads,
  clients,
  campaigns,
  initialStatusFilter,
  initialFollowUpFilter,
  initialClientFilter,
  viewingClientName,
  emailStatusByLeadId,
  appointmentStatusByLeadId,
}: {
  leads: LeadgenLeadRow[];
  // Every client's id/name (agents can already read the full roster - see
  // leads/new/page.tsx) - only used here to label leads and populate the
  // client filter; the leads themselves are already RLS-scoped to this
  // agent.
  clients?: { id: string; name: string }[];
  // Every campaign's id/name (agents can already read the full roster,
  // same convention as clients above) - only used here to label leads.
  campaigns?: { id: string; name: string }[];
  // Pre-select a filter when landing here from the agent dashboard's
  // clickable stat cards (see /leadgen/agent/(dashboard)/page.tsx) -
  // ignored (falls back to "all") if not a recognized value, so a
  // stale/tampered URL never crashes this page. Same convention as the
  // admin leads page's LeadsListClient.
  initialStatusFilter?: string;
  initialFollowUpFilter?: "due_today" | "overdue";
  // Set by the agent dashboard's "My Results by Client" section via
  // ?client=<id> - pre-selects the Client filter below.
  initialClientFilter?: string;
  // Display name for the "Viewing X" banner when scoped to one client.
  viewingClientName?: string | null;
  // Latest tracked-email status per lead id - the same leadgen_emails
  // data the admin Leads table and the Client Detail Communications tab
  // already read. A lead with no tracked email simply has no entry here.
  emailStatusByLeadId?: Record<string, LeadgenEmailStatus>;
  // Most recent appointment status per lead id - a lead with no
  // appointment simply has no entry here.
  appointmentStatusByLeadId?: Record<string, LeadgenAppointmentStatus>;
}) {
  const [statusFilter, setStatusFilter] = useState<string>(
    initialStatusFilter && LEADGEN_LEAD_STATUSES.includes(initialStatusFilter as LeadgenLeadStatus) ? initialStatusFilter : "all"
  );
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>(initialFollowUpFilter ?? "all");
  const [search, setSearch] = useState("");
  const clientList = clients ?? [];
  const campaignList = campaigns ?? [];
  const validInitialClient = initialClientFilter && clientList.some((c) => c.id === initialClientFilter) ? initialClientFilter : "all";
  const [clientFilter, setClientFilter] = useState(validInitialClient);
  const clientNameById = new Map(clientList.map((c) => [c.id, c.name] as const));
  const campaignNameById = new Map(campaignList.map((c) => [c.id, c.name] as const));
  // Only worth a column/filter of its own when this agent's leads
  // actually span more than one client - same condition the prior
  // card-based layout used to decide whether to show the client name at
  // all.
  const showClientColumn = clientList.length > 0 && new Set(leads.map((l) => l.client_id)).size > 1;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (clientFilter !== "all" && lead.client_id !== clientFilter) return false;
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (followUpFilter === "due_today" && !isLeadgenNextFollowUpDueToday(lead.next_follow_up_at)) return false;
      if (followUpFilter === "overdue" && !isLeadgenNextFollowUpOverdue(lead.next_follow_up_at)) return false;
      if (!query) return true;
      return (
        lead.business_name.toLowerCase().includes(query) ||
        (lead.contact_name ?? "").toLowerCase().includes(query) ||
        (lead.phone ?? "").toLowerCase().includes(query)
      );
    });
  }, [leads, clientFilter, statusFilter, followUpFilter, search]);

  // Pagination over `filtered` - a pure display slice, no change to which
  // leads match the filters. Same approach as the admin Leads table
  // (LeadsListClient).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // A filter/search change can shrink the result set out from under the
  // page the agent was on - jump back to page 1 whenever the filters
  // themselves change. Adjusting state during render (React's documented
  // pattern for "derived state that resets on a dependency change")
  // rather than in a useEffect, which would cause an extra render pass.
  const filterKey = JSON.stringify([clientFilter, statusFilter, followUpFilter, search]);
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);
  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1);
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [totalPages, currentPage]);

  return (
    <div>
      {viewingClientName && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[13.5px] font-semibold text-sky-800">Viewing {viewingClientName}</p>
          <Link href="/leadgen/agent" className="text-[13px] font-semibold text-sky-700 hover:text-sky-900">
            ← Back to All Clients
          </Link>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {showClientColumn && (
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={`${filterInputClass} w-auto`}>
            <option value="all">All clients</option>
            {clientList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business, contact, phone…"
          className={`${filterInputClass} w-full max-w-xs`}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${filterInputClass} w-auto`}>
          <option value="all">All statuses</option>
          {LEADGEN_LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={followUpFilter}
          onChange={(e) => setFollowUpFilter(e.target.value as FollowUpFilter)}
          className={`${filterInputClass} w-auto`}
        >
          <option value="all">All follow-ups</option>
          <option value="due_today">Due today</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {leads.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-[13.5px] text-slate-500">
          No leads assigned to you yet.
        </p>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-[13.5px] text-slate-500">No leads match your search/filter.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                      <th className="min-w-[180px] px-3 py-2">Business</th>
                      {showClientColumn && <th className="px-3 py-2">Client</th>}
                      <th className="px-3 py-2">Campaign</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Email Status</th>
                      <th className="px-3 py-2">Appointment Status</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((lead) => (
                      <tr key={lead.id} className="border-b border-slate-100">
                        <td className="max-w-[220px] px-3 py-2">
                          <Link
                            href={`/leadgen/agent/leads/${lead.id}`}
                            className="line-clamp-2 break-words font-semibold text-sky-600 hover:text-sky-700"
                          >
                            {lead.business_name}
                          </Link>
                          <div className="truncate text-[11px] text-slate-500">{lead.contact_name || lead.phone || lead.email || ""}</div>
                        </td>
                        {showClientColumn && (
                          <td className="px-3 py-2 text-slate-600">{clientNameById.get(lead.client_id) ?? "—"}</td>
                        )}
                        <td className="px-3 py-2 text-slate-600">
                          {lead.campaign_id ? campaignNameById.get(lead.campaign_id) ?? "—" : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {emailStatusByLeadId?.[lead.id] ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[emailStatusByLeadId[lead.id]]}`}
                            >
                              {LEADGEN_EMAIL_STATUS_LABELS[emailStatusByLeadId[lead.id]]}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {appointmentStatusByLeadId?.[lead.id] ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appointmentStatusByLeadId[lead.id]]}`}
                            >
                              {appointmentStatusByLeadId[lead.id]}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/leadgen/agent/leads/${lead.id}`}
                            className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11.5px] font-semibold text-sky-700 hover:bg-sky-100"
                          >
                            Manage
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-2.5 text-[12.5px] text-slate-500">
                <span>
                  {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length} lead
                  {filtered.length === 1 ? "" : "s"}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5">
                    <span>Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-[12.5px]"
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                      className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ‹
                    </button>
                    {pageNumbers.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        className={`rounded-md px-2.5 py-1 font-semibold ${
                          n === currentPage ? "bg-sky-600 text-white" : "border border-slate-300 text-slate-700 hover:border-slate-400"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                      className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
