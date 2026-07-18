"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LEAD_STAGES,
  LEAD_STAGE_STYLES,
  isOverdue,
  isDueToday,
  type CrmLeadRow,
  type LeadStage,
} from "@/lib/crm-types";

export default function AgentDashboardClient({ leads }: { leads: CrmLeadRow[] }) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");

  const dueToday = leads.filter(isDueToday).length;
  const overdue = leads.filter(isOverdue).length;
  const newLeads = leads.filter((l) => l.stage === "New interested lead").length;
  const followUpRequired = leads.filter((l) => l.stage === "Follow-up required").length;

  const stats = [
    { label: "Total Leads", value: leads.length },
    { label: "New Leads", value: newLeads },
    { label: "Due Today", value: dueToday, warn: dueToday > 0 },
    { label: "Overdue", value: overdue, danger: overdue > 0 },
    { label: "Follow-up Required", value: followUpRequired },
  ];

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (stageFilter !== "all" && lead.stage !== stageFilter) return false;
      if (!query) return true;
      return (
        lead.business_name.toLowerCase().includes(query) ||
        (lead.contact_name ?? "").toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        (lead.email ?? "").toLowerCase().includes(query) ||
        lead.city.toLowerCase().includes(query)
      );
    });
  }, [leads, query, stageFilter]);

  return (
    <div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-xl border p-4 ${
              stat.danger
                ? "border-red-200 bg-red-50"
                : stat.warn
                  ? "border-amber-200 bg-amber-50"
                  : "border-[var(--color-border)] bg-[var(--color-input-bg)]"
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {stat.label}
            </div>
            <div
              className={`mt-1 font-heading text-[22px] font-bold ${
                stat.danger ? "text-red-700" : "text-[var(--color-ink-strong)]"
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
          placeholder="Search by name, phone, email, city..."
          className="w-full max-w-sm rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as LeadStage | "all")}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All stages</option>
          {LEAD_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>

      {leads.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No leads yet.{" "}
          <Link href="/agent/leads/new" className="font-semibold text-[var(--color-accent)]">
            Add your first lead
          </Link>{" "}
          to get started.
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No leads match your search.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((lead) => (
            <Link
              key={lead.id}
              href={`/agent/leads/${lead.id}`}
              className={`block rounded-xl border p-4 transition hover:border-[var(--color-accent)] ${
                isOverdue(lead)
                  ? "border-red-200 bg-red-50"
                  : isDueToday(lead)
                    ? "border-amber-200 bg-amber-50"
                    : "border-[var(--color-border)] bg-[var(--color-input-bg)]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-[var(--color-ink-strong)]">
                  {lead.business_name}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEAD_STAGE_STYLES[lead.stage]}`}
                >
                  {lead.stage}
                </span>
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                {lead.contact_name ? `${lead.contact_name} · ` : ""}
                {lead.phone} · {lead.city}
              </div>
              {lead.next_follow_up_at && (
                <div
                  className={`mt-2 text-[12.5px] font-medium ${
                    isOverdue(lead) ? "text-red-700" : "text-[var(--color-text-muted)]"
                  }`}
                >
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
