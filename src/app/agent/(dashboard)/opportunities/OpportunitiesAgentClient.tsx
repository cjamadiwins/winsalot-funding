"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  OPPORTUNITY_STATUS_STYLES,
  INTENT_LEVEL_STYLES,
  LEAD_CATEGORY_STYLES,
  type ActiveCleaningOpportunityRow,
} from "@/lib/opportunities/types";

export default function OpportunitiesAgentClient({
  opportunities,
}: {
  opportunities: ActiveCleaningOpportunityRow[];
}) {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return opportunities;
    return opportunities.filter(
      (o) =>
        (o.organization_name ?? "").toLowerCase().includes(query) ||
        o.opportunity_title.toLowerCase().includes(query) ||
        (o.city ?? "").toLowerCase().includes(query)
    );
  }, [opportunities, query]);

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search organization, city..."
        className="w-full max-w-xs rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14.5px]"
      />

      <div className="mt-4 space-y-3">
        {filtered.map((o) => (
          <Link
            key={o.id}
            href={`/agent/opportunities/${o.id}`}
            className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4 transition hover:border-[var(--color-accent)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-[var(--color-ink-strong)]">
                  {o.organization_name || o.opportunity_title}
                </div>
                <div className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
                  {o.service_needed || o.industry || o.opportunity_title} ·{" "}
                  {[o.city, o.province].filter(Boolean).join(", ")}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${LEAD_CATEGORY_STYLES[o.lead_category]}`}>
                  {o.lead_category}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${INTENT_LEVEL_STYLES[o.intent_level]}`}>
                  {o.intent_level}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${OPPORTUNITY_STATUS_STYLES[o.status]}`}>
                  {o.status}
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--color-text-muted)]">
              <span>Phone: {o.public_phone || "—"}</span>
              <span>Email: {o.public_email || "—"}</span>
              <span>Deadline: {o.deadline ? new Date(o.deadline).toLocaleDateString() : "—"}</span>
            </div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-6 text-center text-sm text-[var(--color-text-muted)]">
            No opportunities assigned to you yet.
          </p>
        )}
      </div>
    </div>
  );
}
