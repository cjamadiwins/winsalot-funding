"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isLeadgenNextFollowUpDueToday,
  isLeadgenNextFollowUpOverdue,
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_LEAD_STATUSES,
  LEADGEN_LEAD_STATUS_STYLES,
  type LeadgenAppointmentStatus,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenLeadRow,
  type LeadgenLeadStatus,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import { leadgenDateKey } from "@/lib/leadgen-performance";
import { assignLeadAction, bulkAssignLeadsAction, createLeadAction, deleteLeadgenLeadAction, uploadLeadsCsvAction } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

type FollowUpFilter = "all" | "due_today" | "due" | "overdue";

export default function LeadsListClient({
  leads,
  clients,
  campaigns,
  agents,
  appointmentStatusByLeadId,
  initialSuccessMessage,
  initialStatusFilter,
  initialFollowUpFilter,
  initialAgentFilter,
  initialDueFrom,
  initialDueTo,
}: {
  leads: LeadgenLeadRow[];
  clients: LeadgenClientRow[];
  campaigns: LeadgenCampaignRow[];
  agents: LeadgenUserRow[];
  // Most recent appointment status per lead_id, for the Appointment
  // Status column - a lead with no appointment simply has no entry here.
  appointmentStatusByLeadId?: Record<string, LeadgenAppointmentStatus>;
  initialSuccessMessage?: string | null;
  // Pre-select a filter when landing here from the admin dashboard's
  // clickable stat cards or Results by Agent chart (see
  // /leadgen/admin/(dashboard)/page.tsx and ResultsByAgentChart.tsx) -
  // ignored (falls back to "all"/unfiltered) if not a recognized value,
  // so a stale/tampered URL never crashes this page.
  initialStatusFilter?: string;
  initialFollowUpFilter?: "due_today" | "due" | "overdue";
  initialAgentFilter?: string;
  // Only meaningful alongside initialFollowUpFilter "due"/"overdue" -
  // the Results by Agent chart's active date range (YYYY-MM-DD,
  // inclusive), so "Follow-ups Due this week" on the chart shows exactly
  // that same week's due leads here, not every upcoming one.
  initialDueFrom?: string;
  initialDueTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(initialSuccessMessage ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAgent, setBulkAgent] = useState("");
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);

  const [clientFilter, setClientFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState(
    initialAgentFilter && (initialAgentFilter === "unassigned" || agents.some((a) => a.id === initialAgentFilter))
      ? initialAgentFilter
      : "all"
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    initialStatusFilter && LEADGEN_LEAD_STATUSES.includes(initialStatusFilter as LeadgenLeadStatus) ? initialStatusFilter : "all"
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
  }, [leads, clientFilter, campaignFilter, agentFilter, statusFilter, followUpFilter, search, initialDueFrom, initialDueTo]);

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

  async function handleDeleteLead(lead: LeadgenLeadRow) {
    if (isPending || deletingLeadId) return;
    if (!confirm("Are you sure you want to permanently delete this lead and all related test data? This action cannot be undone.")) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setDeletingLeadId(lead.id);

    const result = await deleteLeadgenLeadAction(lead.id);
    if (result.error) {
      setError(result.error);
      setDeletingLeadId(null);
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(lead.id);
      return next;
    });
    setDeletingLeadId(null);
    setSuccessMessage("Lead deleted successfully.");
    router.refresh();
  }

  return (
    <div>
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
            <select name="client_id" required className={inputClass} defaultValue="">
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
              {campaigns.map((c) => (
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

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business, contact, phone, email…"
          className={`${inputClass} w-full max-w-xs`}
        />
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="all">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="all">All agents</option>
          <option value="unassigned">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} w-auto`}>
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
          className={`${inputClass} w-auto`}
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

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No leads match your filters.</p>
        ) : (
          <table className="w-full min-w-[1180px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(filtered.map((l) => l.id)) : new Set())
                    }
                  />
                </th>
                <th className="p-3">Business</th>
                <th className="p-3">Client</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Agent</th>
                <th className="p-3">Status</th>
                <th className="p-3">Appointment Status</th>
                <th className="p-3">Next Follow-up</th>
                <th className="p-3">Last Activity</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-100">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelected(lead.id)} />
                  </td>
                  <td className="p-3">
                    <Link href={`/leadgen/admin/leads/${lead.id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                      {lead.business_name}
                    </Link>
                    <div className="text-[11.5px] text-slate-500">{lead.contact_name || lead.phone || lead.email || ""}</div>
                  </td>
                  <td className="p-3 text-slate-600">{clientById.get(lead.client_id)?.name ?? "—"}</td>
                  <td className="p-3 text-slate-600">{lead.campaign_id ? campaignById.get(lead.campaign_id)?.name ?? "—" : "—"}</td>
                  <td className="p-3">
                    <select
                      value={lead.assigned_agent_id ?? ""}
                      disabled={isPending}
                      onChange={(e) => runAction(() => assignLeadAction(lead.id, e.target.value || null))}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-[12.5px]"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name}
                        </option>
                      ))}
                    </select>
                    {lead.assigned_agent_id && !agentById.get(lead.assigned_agent_id) && (
                      <span className="ml-1 text-[11px] text-slate-400">(former agent)</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {appointmentStatusByLeadId?.[lead.id] ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appointmentStatusByLeadId[lead.id]]}`}
                      >
                        {appointmentStatusByLeadId[lead.id]}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-600">
                    {lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-3 text-slate-600">
                    {lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      disabled={isPending || deletingLeadId === lead.id}
                      onClick={() => handleDeleteLead(lead)}
                      className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingLeadId === lead.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
