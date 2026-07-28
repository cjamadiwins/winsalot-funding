"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LEADGEN_LEAD_STATUSES, LEADGEN_LEAD_STATUS_STYLES, type LeadgenLeadRow } from "@/lib/leadgen-types";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export default function AgentLeadsListClient({ leads }: { leads: LeadgenLeadRow[] }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (!query) return true;
      return (
        lead.business_name.toLowerCase().includes(query) ||
        (lead.contact_name ?? "").toLowerCase().includes(query) ||
        (lead.phone ?? "").toLowerCase().includes(query)
      );
    });
  }, [leads, statusFilter, search]);

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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
