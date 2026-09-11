"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import PerformanceScoreCard from "@/components/crm-ui/PerformanceScoreCard";
import { GROWTH_CRM_GAUGE_SEGMENTS, type PerformanceGaugeSegment, type PerformanceTier } from "@/lib/performance-gauge";

export type AdminPerformanceGaugeRow = {
  id: string;
  agentName: string;
  score: number;
  tier: PerformanceTier;
  summary: string;
  periodLabel: string;
};

// How many cards show before the "Show more" control appears - only
// relevant once a team has grown past a single glance-able screen.
const INITIAL_VISIBLE_COUNT = 6;
// Search/filter only earns its keep once scrolling past a handful of
// cards is already a problem.
const SEARCH_THRESHOLD = 6;

export default function AdminPerformanceGaugeGrid({
  rows,
  reportHref,
  segments = GROWTH_CRM_GAUGE_SEGMENTS,
}: {
  rows: AdminPerformanceGaugeRow[];
  reportHref: string;
  segments?: readonly PerformanceGaugeSegment[];
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.agentName.toLowerCase().includes(q));
  }, [rows, query]);

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE_COUNT);
  const remaining = filtered.length - visible.length;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Agent Performance Score</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Live 0–100 scores calculated from the CRM&apos;s existing performance targets.</p>
        </div>
        <Link href={reportHref} className="text-[13px] font-semibold text-teal-700 hover:text-teal-800">
          Open full report →
        </Link>
      </div>

      {rows.length > SEARCH_THRESHOLD && (
        <div className="relative mt-4 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowAll(false);
            }}
            placeholder="Search agents by name…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-500">No active agents yet.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-500">No agents match &quot;{query}&quot;.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            {visible.map((row) => (
              <PerformanceScoreCard
                key={row.id}
                agentName={row.agentName}
                score={row.score}
                tier={row.tier}
                segments={segments}
                periodLabel={row.periodLabel}
                resultsLine={row.summary}
                gaugeSize={200}
                strokeWidth={13}
                compact
              />
            ))}
          </div>

          {remaining > 0 && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Show {remaining} more agent{remaining === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
