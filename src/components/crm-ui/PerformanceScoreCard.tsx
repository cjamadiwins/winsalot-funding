import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import PerformanceRing from "@/components/crm-ui/PerformanceRing";
import {
  GROWTH_CRM_GAUGE_SEGMENTS,
  PERFORMANCE_BAND_STYLES,
  performanceBand,
  type PerformanceGaugeSegment,
  type PerformanceTier,
} from "@/lib/performance-gauge";
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
  gaugeSize = 280,
  strokeWidth = 16,
  tiles,
  children,
  className = "",
  compact = false,
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
  // Smaller padding/type scale and a condensed message row, for the admin
  // "every agent" grid where many cards share the page at once. Same
  // gauge/status/data - just sized to stay readable two-per-row instead
  // of the large single-agent report/dashboard layout.
  compact?: boolean;
}) {
  // Derived from the score against the same segment set the gauge itself
  // paints with, rather than from any CRM-specific tier helper, so the
  // status pill and message box can never disagree with the needle and
  // centre score above them (brief: "must always agree").
  const band = performanceBand(score, segments);
  const style = PERFORMANCE_BAND_STYLES[band.key];
  const message = performanceStatusMessage(band.key);

  return (
    <section
      className={`flex h-full flex-col rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 shadow-sm ${compact ? "p-5" : "p-8 sm:p-10"} ${className}`}
    >
      <div className={`flex flex-col items-center sm:flex-row sm:items-stretch ${compact ? "gap-5" : "gap-10"}`}>
        <div className={`flex shrink-0 items-center justify-center sm:border-r sm:border-slate-200 ${compact ? "sm:pr-5" : "sm:pr-10"}`}>
          <PerformanceRing percentage={score} tier={tier} size={gaugeSize} strokeWidth={strokeWidth} segments={segments} />
        </div>

        <div className={`min-w-0 flex-1 text-center sm:text-left ${compact ? "" : "sm:pl-4"}`}>
          <h2 className={`truncate font-bold text-slate-900 ${compact ? "text-[18px]" : "text-[30px]"}`}>{agentName}</h2>
          <span
            className={`inline-flex items-center gap-2 rounded-full font-semibold ${style.badge} ${compact ? "mt-1.5 px-2.5 py-1 text-[11.5px]" : "mt-2.5 px-3.5 py-1.5 text-[14.5px]"}`}
          >
            <span className={`rounded-full ${style.bar} ${compact ? "h-2 w-2" : "h-2.5 w-2.5"}`} aria-hidden="true" />
            {band.label}
          </span>

          <p className={`font-semibold text-slate-700 ${compact ? "mt-3 text-[13px]" : "mt-5 text-[16.5px]"}`}>{resultsLine}</p>
          <p className={`text-slate-500 ${compact ? "mt-1 text-[11.5px]" : "mt-1.5 text-[14px]"}`}>{periodLabel}</p>

          <div className={`flex items-start gap-3.5 rounded-xl bg-sky-50 text-left ${compact ? "mt-3 gap-2.5 p-3" : "mt-5 p-5"}`}>
            <span
              className={`flex shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 ${compact ? "h-7 w-7" : "h-10 w-10"}`}
            >
              <TrendingUp className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <div className={`font-bold text-slate-900 ${compact ? "text-[12.5px]" : "text-[15.5px]"}`}>{message.headline}</div>
              {!compact && <div className="mt-1 text-[14px] text-slate-600">{message.description}</div>}
            </div>
          </div>

          {reportHref && (
            <Link
              href={reportHref}
              className={`inline-block whitespace-nowrap font-semibold text-sky-600 hover:text-sky-700 ${compact ? "mt-3 text-[12.5px]" : "mt-5 text-[14.5px]"}`}
            >
              View full report →
            </Link>
          )}
        </div>
      </div>

      {tiles && <div className="mt-8 grid gap-4 sm:grid-cols-3">{tiles}</div>}
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
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      {icon && <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneClass}`}>{icon}</span>}
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-semibold text-slate-500">{label}</div>
        <div className="mt-0.5 text-[26px] font-bold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

const TILE_ICON_TONE: Record<"sky" | "violet" | "emerald", string> = {
  sky: "bg-sky-100 text-sky-600",
  violet: "bg-violet-100 text-violet-600",
  emerald: "bg-emerald-100 text-emerald-600",
};
