import Link from "next/link";
import PerformanceRing, { type PerformanceGaugeSegment, type PerformanceTier } from "@/components/crm-ui/PerformanceRing";

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
  segments,
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
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.id} className="flex min-w-0 flex-col items-center rounded-xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:gap-4">
              <PerformanceRing percentage={row.score} tier={row.tier} label="performance score" size={150} strokeWidth={12} segments={segments} />
              <div className="min-w-0 text-center sm:text-left">
                <h3 className="truncate text-[14px] font-bold text-slate-900">{row.agentName}</h3>
                <p className="mt-1 text-[12px] font-medium text-slate-600">{row.summary}</p>
                <p className="mt-1 text-[11.5px] text-slate-500">{row.periodLabel}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
