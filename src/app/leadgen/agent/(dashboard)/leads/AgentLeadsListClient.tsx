"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  LEADGEN_LEAD_STATUSES,
  LEADGEN_LEAD_STATUS_STYLES,
  isLeadgenNextFollowUpDueToday,
  isLeadgenNextFollowUpOverdue,
  type LeadgenEmailStatus,
  type LeadgenLeadRow,
  type LeadgenLeadStatus,
} from "@/lib/leadgen-types";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

type FollowUpFilter = "all" | "due_today" | "overdue";

export default function AgentLeadsListClient({
  leads,
  initialStatusFilter,
  initialFollowUpFilter,
  emailStatusByLeadId,
}: {
  leads: LeadgenLeadRow[];
  // Pre-select a filter when landing here from the agent dashboard's
  // clickable stat cards (see /leadgen/agent/(dashboard)/page.tsx) -
  // ignored (falls back to "all") if not a recognized value, so a
  // stale/tampered URL never crashes this page. Same convention as the
  // admin leads page's LeadsListClient.
  initialStatusFilter?: string;
  initialFollowUpFilter?: "due_today" | "overdue";
  // Latest tracked-email status per lead id, for the quick-glance badge
  // below - optional so any other caller of this component keeps working
  // unchanged if it doesn't pass one.
  emailStatusByLeadId?: Record<string, LeadgenEmailStatus>;
}) {
  const [statusFilter, setStatusFilter] = useState<string>(
    initialStatusFilter && LEADGEN_LEAD_STATUSES.includes(initialStatusFilter as LeadgenLeadStatus) ? initialStatusFilter : "all"
  );
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>(initialFollowUpFilter ?? "all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
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
  }, [leads, statusFilter, followUpFilter, search]);

  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business, contact, phone…"
          className={`${inputClass} w-full max-w-xs`}
        />
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
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {leads.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-[13.5px] text-slate-500">
          No leads assigned to you yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-[13.5px] text-slate-500">
          No leads match your search/filter.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {filtered.map((lead) => (
            <Link
              key={lead.id}
              href={`/leadgen/agent/leads/${lead.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{lead.business_name}</span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>{lead.status}</span>
              </div>
              <div className="mt-1 text-[13px] text-slate-500">
                {[lead.contact_name, lead.phone, lead.email].filter(Boolean).join(" · ")}
              </div>
              {lead.next_follow_up_at && (
                <div className="mt-1.5 text-[12.5px] font-medium text-slate-600">
                  Next follow-up: {new Date(lead.next_follow_up_at).toLocaleString()}
                </div>
              )}
              {emailStatusByLeadId?.[lead.id] && (
                <div className="mt-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[emailStatusByLeadId[lead.id]]}`}
                  >
                    Email: {LEADGEN_EMAIL_STATUS_LABELS[emailStatusByLeadId[lead.id]]}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
