import Link from "next/link";
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

export default function AdminPerformanceGaugeGrid({
  rows,
  reportHref,
  segments = GROWTH_CRM_GAUGE_SEGMENTS,
}: {
  rows: AdminPerformanceGaugeRow[];
  reportHref: string;
  segments?: readonly PerformanceGaugeSegment[];
}) {
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

      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-500">No active agents yet.</p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {rows.map((row) => (
            <PerformanceScoreCard
              key={row.id}
              agentName={row.agentName}
              score={row.score}
              tier={row.tier}
              segments={segments}
              periodLabel={row.periodLabel}
              resultsLine={row.summary}
              gaugeSize={220}
            />
          ))}
        </div>
      )}
    </section>
  );
}
