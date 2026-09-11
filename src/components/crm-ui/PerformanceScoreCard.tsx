import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import PerformanceRing, {
  GROWTH_CRM_GAUGE_SEGMENTS,
  PERFORMANCE_BAND_STYLES,
  performanceBand,
  type PerformanceGaugeSegment,
  type PerformanceTier,
} from "@/components/crm-ui/PerformanceRing";
import { performanceStatusMessage } from "@/lib/performance-message";

// The single "Agent Performance Score" card shared by every Growth CRM
// and Lead Generation CRM dashboard/report surface - gauge on the left,
// agent name/status/weekly results/reporting range/message on the right,
// with an optional row of result tiles and any extra CRM-specific detail
// (progress bars, scorecards, history tables) passed in as children.
// Centralizing this here is what keeps the redesign identical across
// every surface instead of six near-duplicate hand-rolled layouts.
export default function PerformanceScoreCard({
  agentName,
  score,
  tier,
  segments = GROWTH_CRM_GAUGE_SEGMENTS,
  periodLabel,
  resultsLine,
  reportHref,
  gaugeSize = 230,
  strokeWidth = 14,
  tiles,
  children,
  className = "",
}: {
  agentName: string;
  score: number;
  tier: PerformanceTier;
  segments?: readonly PerformanceGaugeSegment[];
  periodLabel: string;
  resultsLine: string;
  reportHref?: string;
  gaugeSize?: number;
  strokeWidth?: number;
  tiles?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  // Derived from the score against the same segment set the gauge itself
  // paints with, rather than from any CRM-specific tier helper, so the
  // status pill and message box can never disagree with the needle and
  // centre score above them (brief: "must always agree").
  const band = performanceBand(score, segments);
  const style = PERFORMANCE_BAND_STYLES[band.key];
  const message = performanceStatusMessage(band.key);

  return (
    <section className={`rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-6 shadow-sm sm:p-8 ${className}`}>
      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-stretch">
        <div className="flex shrink-0 items-center justify-center sm:border-r sm:border-slate-200 sm:pr-8">
          <PerformanceRing percentage={score} tier={tier} size={gaugeSize} strokeWidth={strokeWidth} segments={segments} />
        </div>

        <div className="min-w-0 flex-1 text-center sm:pl-2 sm:text-left">
          <h2 className="truncate text-[24px] font-bold text-slate-900">{agentName}</h2>
          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${style.badge}`}
          >
            <span className={`h-2 w-2 rounded-full ${style.bar}`} aria-hidden="true" />
            {band.label}
          </span>

          <p className="mt-4 text-[14.5px] font-semibold text-slate-700">{resultsLine}</p>
          <p className="mt-1 text-[13px] text-slate-500">{periodLabel}</p>

          <div className="mt-4 flex items-start gap-3 rounded-xl bg-sky-50 p-4 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
              <TrendingUp className="h-5 w-5" strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-slate-900">{message.headline}</div>
              <div className="mt-0.5 text-[13px] text-slate-600">{message.description}</div>
            </div>
          </div>

          {reportHref && (
            <Link href={reportHref} className="mt-4 inline-block whitespace-nowrap text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
              View full report →
            </Link>
          )}
        </div>
      </div>

      {tiles && <div className="mt-6 grid gap-3 sm:grid-cols-3">{tiles}</div>}
      {children}
    </section>
  );
}

export function PerformanceTile({
  label,
  value,
  icon,
  tone = "sky",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "sky" | "violet" | "emerald";
}) {
  const toneClass = TILE_ICON_TONE[tone];
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      {icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClass}`}>{icon}</span>}
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-semibold text-slate-500">{label}</div>
        <div className="mt-0.5 text-[22px] font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

const TILE_ICON_TONE: Record<"sky" | "violet" | "emerald", string> = {
  sky: "bg-sky-100 text-sky-600",
  violet: "bg-violet-100 text-violet-600",
  emerald: "bg-emerald-100 text-emerald-600",
};
