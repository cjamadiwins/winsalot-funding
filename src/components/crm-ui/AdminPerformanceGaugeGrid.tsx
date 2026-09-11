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
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {rows.map((row) => (
            <article key={row.id} className="flex min-w-0 flex-col items-center rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-5 shadow-sm sm:flex-row sm:gap-6">
              <PerformanceRing percentage={row.score} tier={row.tier} label="Performance Score" size={230} strokeWidth={14} segments={segments} />
              <div className="min-w-0 text-center sm:text-left">
                <h3 className="truncate text-[17px] font-bold text-slate-900">{row.agentName}</h3>
                <p className="mt-2 text-[13px] font-semibold leading-5 text-slate-700">{row.summary}</p>
                <p className="mt-1.5 text-[12px] text-slate-500">{row.periodLabel}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
