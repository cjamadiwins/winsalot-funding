"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  isLeadgenNextFollowUpDueToday,
  isLeadgenNextFollowUpOverdue,
  LEADGEN_APPOINTMENT_STATUSES,
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  LEADGEN_LEAD_STATUSES,
  LEADGEN_LEAD_STATUS_STYLES,
  type LeadgenAppointmentStatus,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenEmailStatus,
  type LeadgenLeadRow,
  type LeadgenLeadStatus,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import { leadgenDateKey } from "@/lib/leadgen-performance";
import type { DncSuppressionRow } from "@/lib/dnc-suppression";
import DncBadge from "@/components/crm-ui/DncBadge";
import { assignLeadAction, bulkAssignLeadsAction, createLeadAction, uploadLeadsCsvAction } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";
// Compact filter-bar controls only (Add Lead/CSV upload forms keep the
// roomier inputClass above) - same tighter sizing as the Growth CRM's
// prospect table filter bar, so the filter row doesn't eat up vertical
// space on desktop.
const filterInputClass = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] text-slate-900";

type FollowUpFilter = "all" | "due_today" | "due" | "overdue";
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export default function LeadsListClient({
  leads,
  clients,
  campaigns,
  agents,
  appointmentStatusByLeadId,
  emailStatusByLeadId,
  dncByLeadId,
  initialSuccessMessage,
  initialStatusFilter,
  initialAppointmentStatusFilter,
  initialFollowUpFilter,
  initialAgentFilter,
  initialDueFrom,
  initialDueTo,
  initialClientFilter,
  initialOpenAdd,
  viewingClientName,
}: {
  leads: LeadgenLeadRow[];
  clients: LeadgenClientRow[];
  campaigns: LeadgenCampaignRow[];
  agents: LeadgenUserRow[];
  // Most recent appointment status per lead_id, for the Appointment
  // Status column - a lead with no appointment simply has no entry here.
  appointmentStatusByLeadId?: Record<string, LeadgenAppointmentStatus>;
  // Most recent leadgen_emails.status per lead_id, for the Email Status
  // column - the exact same tracked-email data the Client Detail page's
  // Communications tab already reads, just reduced to the latest status
  // per lead. A lead with no tracked email simply has no entry here.
  emailStatusByLeadId?: Record<string, LeadgenEmailStatus>;
  // Shared cross-CRM Do Not Contact restriction per lead id (Item 7's
  // "anywhere a suppressed prospect appears") - a lead with no active
  // restriction simply has no entry here.
  dncByLeadId?: Record<string, DncSuppressionRow>;
  initialSuccessMessage?: string | null;
  // Pre-select a filter when landing here from the admin dashboard's
  // clickable stat cards or Results by Agent chart (see
  // /leadgen/admin/(dashboard)/page.tsx and ResultsByAgentChart.tsx) -
  // ignored (falls back to "all"/unfiltered) if not a recognized value,
  // so a stale/tampered URL never crashes this page.
  initialStatusFilter?: string;
  // The "Appointments Booked" dashboard card links here with
  // ?appointment_status=Booked instead of the main-status filter above -
  // this is the actual appointment-status column's source of truth
  // (leadgen_appointments.status via appointmentStatusByLeadId), so a
  // lead whose main status hasn't caught up yet (e.g. still
  // "Consultation Information Sent") still shows up when its appointment
  // is genuinely Booked.
  initialAppointmentStatusFilter?: string;
  initialFollowUpFilter?: "due_today" | "due" | "overdue";
  initialAgentFilter?: string;
  // Only meaningful alongside initialFollowUpFilter "due"/"overdue" -
  // the Results by Agent chart's active date range (YYYY-MM-DD,
  // inclusive), so "Follow-ups Due this week" on the chart shows exactly
  // that same week's due leads here, not every upcoming one.
  initialDueFrom?: string;
  initialDueTo?: string;
  // Set by the admin dashboard's "Results by Client" table or a client
  // campaign dashboard (leadgen/admin/clients/[id]) via ?client=<id> -
  // pre-selects the Client filter below and, paired with
  // initialOpenAdd, the Add Lead form's own Client field. Ignored (falls
  // back to "all clients") if it doesn't match a real client id.
  initialClientFilter?: string;
  // Auto-expands the Add Lead form on load - only meaningful alongside
  // initialClientFilter (the campaign dashboard's "Add Lead" quick
  // action).
  initialOpenAdd?: boolean;
  // Display name for the banner ("Viewing X") when landing here scoped
  // to one client - null/undefined renders no banner (the normal,
  // unscoped "every client" view).
  viewingClientName?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showAddForm, setShowAddForm] = useState(!!initialOpenAdd);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const successMessage = initialSuccessMessage ?? null;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAgent, setBulkAgent] = useState("");

  const validInitialClient = initialClientFilter && clients.some((c) => c.id === initialClientFilter) ? initialClientFilter : "all";
  const [clientFilter, setClientFilter] = useState(validInitialClient);
  const [campaignFilter, setCampaignFilter] = useState("all");
  // Client selected in the "Add Lead" form below - drives which campaigns
  // that form's Campaign field offers, so a campaign from a different
  // client can never be picked for this lead (see campaignsForAddForm).
  const [addFormClientId, setAddFormClientId] = useState(validInitialClient !== "all" ? validInitialClient : "");
  const campaignsForAddForm = campaigns.filter((c) => c.client_id === addFormClientId);
  const [agentFilter, setAgentFilter] = useState(
    initialAgentFilter && (initialAgentFilter === "unassigned" || agents.some((a) => a.id === initialAgentFilter))
      ? initialAgentFilter
      : "all"
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    initialStatusFilter && LEADGEN_LEAD_STATUSES.includes(initialStatusFilter as LeadgenLeadStatus) ? initialStatusFilter : "all"
  );
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<string>(
    initialAppointmentStatusFilter && LEADGEN_APPOINTMENT_STATUSES.includes(initialAppointmentStatusFilter as LeadgenAppointmentStatus)
      ? initialAppointmentStatusFilter
      : "all"
  );
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>(initialFollowUpFilter ?? "all");
  const [search, setSearch] = useState("");

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    // Only relevant when followUpFilter is "due"/"overdue" and the
    // chart passed a due_from/due_to range - true (no restriction)
    // otherwise.
    function isWithinDueRange(nextFollowUpAt: string): boolean {
      if (!initialDueFrom && !initialDueTo) return true;
      const key = leadgenDateKey(new Date(nextFollowUpAt));
      if (initialDueFrom && key < initialDueFrom) return false;
      if (initialDueTo && key > initialDueTo) return false;
      return true;
    }

    return leads.filter((lead) => {
      if (clientFilter !== "all" && lead.client_id !== clientFilter) return false;
      if (campaignFilter !== "all" && lead.campaign_id !== campaignFilter) return false;
      if (agentFilter === "unassigned" && lead.assigned_agent_id) return false;
      if (agentFilter !== "all" && agentFilter !== "unassigned" && lead.assigned_agent_id !== agentFilter) return false;
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      // Source of truth is the appointment record itself
      // (appointmentStatusByLeadId, built from leadgen_appointments.status
      // on the server), never the lead's main status - a lead can be
      // genuinely "Appointment Status: Booked" while its main status is
      // still something else (e.g. "Consultation Information Sent").
      if (appointmentStatusFilter !== "all" && appointmentStatusByLeadId?.[lead.id] !== appointmentStatusFilter) return false;
      if (followUpFilter === "due_today" && !isLeadgenNextFollowUpDueToday(lead.next_follow_up_at)) return false;
      if (followUpFilter === "due") {
        if (!lead.next_follow_up_at || isLeadgenNextFollowUpOverdue(lead.next_follow_up_at)) return false;
        if (!isWithinDueRange(lead.next_follow_up_at)) return false;
      }
      if (followUpFilter === "overdue") {
        if (!isLeadgenNextFollowUpOverdue(lead.next_follow_up_at)) return false;
        if (lead.next_follow_up_at && !isWithinDueRange(lead.next_follow_up_at)) return false;
      }
      if (!query) return true;
      return (
        lead.business_name.toLowerCase().includes(query) ||
        (lead.contact_name ?? "").toLowerCase().includes(query) ||
        (lead.phone ?? "").toLowerCase().includes(query) ||
        (lead.email ?? "").toLowerCase().includes(query)
      );
    });
  }, [leads, clientFilter, campaignFilter, agentFilter, statusFilter, appointmentStatusFilter, appointmentStatusByLeadId, followUpFilter, search, initialDueFrom, initialDueTo]);

  // Pagination over `filtered` - a pure display slice, no change to which
  // leads match the filters. Every filter above already lives in this
  // same component's local state, so changing page never loses a filter
  // selection - it's all one render, not a navigation.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // A filter/search change can shrink the result set out from under the
  // page the admin was on - jump back to page 1 whenever the filters
  // themselves change. Adjusting state during render (React's documented
  // pattern for "derived state that resets on a dependency change")
  // rather than in a useEffect, which would cause an extra render pass.
  const filterKey = JSON.stringify([clientFilter, campaignFilter, agentFilter, statusFilter, appointmentStatusFilter, followUpFilter, search]);
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

  function runAction(fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {viewingClientName && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[13.5px] font-semibold text-sky-800">Viewing {viewingClientName}</p>
          <Link href="/leadgen/admin" className="text-[13px] font-semibold text-sky-700 hover:text-sky-900">
            ← Back to All Clients
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => setShowAddForm((v) => !v)} className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
          {showAddForm ? "Cancel" : "+ Add Lead"}
        </button>
        <button
          type="button"
          onClick={() => setShowUpload((v) => !v)}
          className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400"
        >
          {showUpload ? "Cancel" : "Upload Leads by CSV"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {successMessage && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMessage}</p>}
      {uploadResult && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{uploadResult}</p>}

      {showAddForm && (
        <form
          action={(formData) =>
            runAction(() => createLeadAction(formData), () => setShowAddForm(false))
          }
          className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Business Name</span>
            <input name="business_name" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Client</span>
            <select
              name="client_id"
              required
              className={inputClass}
              value={addFormClientId}
              onChange={(e) => setAddFormClientId(e.target.value)}
            >
              <option value="" disabled>
                Select a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Campaign (optional)</span>
            <select name="campaign_id" className={inputClass} defaultValue="" key={addFormClientId}>
              <option value="">No campaign</option>
              {campaignsForAddForm.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Industry</span>
            <input name="industry" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Contact Name</span>
            <input name="contact_name" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Owner / Decision-Maker</span>
            <input name="decision_maker_name" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Phone</span>
            <input name="phone" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Email</span>
            <input name="email" type="email" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Website</span>
            <input name="website" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">City</span>
            <input name="city" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Province</span>
            <input name="province" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Lead Source</span>
            <input name="lead_source" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-semibold text-slate-600">Notes</span>
            <textarea name="notes" className={`${inputClass} min-h-[60px] resize-y`} />
          </label>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700 sm:col-span-2 sm:w-fit">
            Add Lead
          </button>
        </form>
      )}

      {showUpload && (
        <CsvUploadForm
          clients={clients}
          campaigns={campaigns}
          isPending={isPending}
          onUpload={(formData) =>
            runAction(
              async () => {
                const result = await uploadLeadsCsvAction(formData);
                if (!result.error) {
                  setUploadResult(
                    `Imported ${result.imported} lead${result.imported === 1 ? "" : "s"}.${
                      result.skipped && result.skipped.length > 0 ? ` ${result.skipped.length} row(s) skipped.` : ""
                    }`
                  );
                  setShowUpload(false);
                }
                return result;
              }
            )
          }
        />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business, contact, phone, email…"
          className={`${filterInputClass} w-full max-w-xs`}
        />
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={`${filterInputClass} w-auto`}>
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className={`${filterInputClass} w-auto`}>
          <option value="all">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className={`${filterInputClass} w-auto`}>
          <option value="all">All agents</option>
          <option value="unassigned">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${filterInputClass} w-auto`}>
          <option value="all">All statuses</option>
          {LEADGEN_LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={appointmentStatusFilter} onChange={(e) => setAppointmentStatusFilter(e.target.value)} className={`${filterInputClass} w-auto`}>
          <option value="all">All appointment statuses</option>
          {LEADGEN_APPOINTMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              Appointment: {s}
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
          <option value="due">Due (not yet overdue)</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5">
          <span className="text-[13px] font-semibold text-sky-800">{selected.size} selected</span>
          <select value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">Choose an agent…</option>
            <option value="__unassign__">Unassign</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isPending || !bulkAgent}
            onClick={() =>
              runAction(
                () => bulkAssignLeadsAction(Array.from(selected), bulkAgent === "__unassign__" ? null : bulkAgent),
                () => {
                  setSelected(new Set());
                  setBulkAgent("");
                }
              )
            }
            className="rounded-full bg-sky-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Assign Selected
          </button>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No leads match your filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                    <th className="w-9 min-w-9 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={pageRows.length > 0 && pageRows.every((l) => selected.has(l.id))}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            for (const l of pageRows) {
                              if (e.target.checked) next.add(l.id);
                              else next.delete(l.id);
                            }
                            return next;
                          })
                        }
                      />
                    </th>
                    <th className="min-w-[180px] px-3 py-2">Business</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Campaign</th>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Email Status</th>
                    <th className="px-3 py-2">Appointment Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelected(lead.id)} />
                      </td>
                      <td className="max-w-[220px] px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/leadgen/admin/leads/${lead.id}`}
                            className="line-clamp-2 break-words font-semibold text-sky-600 hover:text-sky-700"
                          >
                            {lead.business_name}
                          </Link>
                          {dncByLeadId?.[lead.id] && <DncBadge suppression={dncByLeadId[lead.id]} />}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">{lead.contact_name || lead.phone || lead.email || ""}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{clientById.get(lead.client_id)?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{lead.campaign_id ? campaignById.get(lead.campaign_id)?.name ?? "—" : "—"}</td>
                      <td className="px-3 py-2">
                        <select
                          value={lead.assigned_agent_id ?? ""}
                          disabled={isPending}
                          onChange={(e) => runAction(() => assignLeadAction(lead.id, e.target.value || null))}
                          className="rounded-md border border-slate-300 px-1.5 py-1 text-[12px]"
                        >
                          <option value="">Unassigned</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.full_name}
                            </option>
                          ))}
                        </select>
                        {lead.assigned_agent_id && !agentById.get(lead.assigned_agent_id) && (
                          <span className="ml-1 text-[10.5px] text-slate-400">(former agent)</span>
                        )}
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
                        {/* Delete lives inside the Manage view (admin-only,
                            same confirmation/safety logic) - not a primary
                            row action, so a busy admin can't mis-click it
                            while scanning the table. */}
                        <Link
                          href={`/leadgen/admin/leads/${lead.id}`}
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
    </div>
  );
}

function CsvUploadForm({
  clients,
  campaigns,
  isPending,
  onUpload,
}: {
  clients: LeadgenClientRow[];
  campaigns: LeadgenCampaignRow[];
  isPending: boolean;
  onUpload: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = useState("");

  const campaignsForClient = campaigns.filter((c) => c.client_id === clientId);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        onUpload(formData);
        formRef.current?.reset();
      }}
      className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5"
    >
      <p className="text-[13px] text-slate-500">
        CSV columns (case-insensitive, any order): Business Name (required), Industry, Contact Name, Owner/Decision Maker,
        Phone, Email, Website, City, Province, Lead Source, Notes.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Client</span>
        <select
          name="client_id"
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Select a client…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Campaign (optional)</span>
        <select name="campaign_id" className={inputClass} defaultValue="">
          <option value="">No campaign</option>
          {campaignsForClient.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Default Lead Source (used when a row has none)</span>
        <input name="lead_source" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">CSV File</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="text-[13px]" />
      </label>
      <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700">
        {isPending ? "Uploading…" : "Upload Leads"}
      </button>
    </form>
  );
}
