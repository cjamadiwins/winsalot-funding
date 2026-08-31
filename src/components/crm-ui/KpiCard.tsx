"use client";

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Dashboard KPI tile shared by both CRMs (Cleaning + Lead Gen, admin +
// agent): a dark surface card with a small circular colored icon, a
// large high-contrast number, and a label - the "approved mockup" tile
// treatment, replacing the old flat colored-badge tiles
// (border-X-200 bg-X-50 text-X-700) that every dashboard used to render
// its stat cards with. Supports two clickable modes - `href` for a plain
// navigation link, or `onClick` for a toggleable filter tile (with an
// `active` outline) - plus a non-interactive `div` when neither is set.
//
// `icon` takes an already-rendered element (e.g. `<Users />`), not a
// component reference - most call sites live in Server Component
// dashboard pages, and a bare component reference (a function) can't
// cross the server/client boundary as a prop, only a rendered element
// can.
export type KpiTone = "blue" | "green" | "amber" | "red" | "purple" | "indigo" | "teal" | "orange" | "rose" | "cyan" | "slate";

const TONE_ICON_BG: Record<KpiTone, string> = {
  blue: "#3E7EF7",
  green: "#22C55E",
  amber: "#F5A623",
  red: "#EF4444",
  purple: "#A855F7",
  indigo: "#6366F1",
  teal: "#14B8A6",
  orange: "#F97316",
  rose: "#F43F5E",
  cyan: "#06B6D4",
  slate: "#64748B",
};

// Optional "vs last 7 days" trend row - a small arrow + percentage plus
// an inline sparkline of the last 7 days' daily volume. Omit `trend`
// entirely to keep the plain tile every existing call site already
// renders; only the Lead Gen admin dashboard passes one today.
export type KpiTrend = {
  pct: number;
  direction: "up" | "down" | "flat";
  // Oldest -> newest daily values, e.g. 7 entries for the last 7 days.
  series: number[];
  // "up" usually means good (green) and "down" bad, but a rising count
  // of something undesirable (e.g. Overdue Follow-ups) should read as
  // bad even though it's an "up" arrow - callers flip this for those.
  goodDirection?: "up" | "down";
};

function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const stepX = 64 / (series.length - 1);
  const points = series.map((v, i) => `${(i * stepX).toFixed(1)},${(18 - ((v - min) / range) * 16).toFixed(1)}`).join(" ");
  return (
    <svg width="64" height="20" viewBox="0 0 64 20" className="shrink-0" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendRow({ trend, tone }: { trend: KpiTrend; tone: KpiTone }) {
  const good = trend.goodDirection ?? "up";
  const isGood = trend.direction === "flat" ? null : trend.direction === good;
  const arrowColor = isGood === null ? "#94a3b8" : isGood ? "#16a34a" : "#dc2626";
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: arrowColor }}>
        {trend.direction === "flat" ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={arrowColor} strokeWidth="3" strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        ) : (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke={arrowColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={trend.direction === "down" ? { transform: "rotate(180deg)" } : undefined}
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        )}
        {trend.pct}%
      </span>
      <Sparkline series={trend.series} color={TONE_ICON_BG[tone]} />
    </div>
  );
}

export default function KpiCard({
  label,
  value,
  href,
  onClick,
  active,
  icon,
  hideIcon = false,
  tone = "blue",
  trend,
}: {
  label: string;
  value: string | number;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  icon: ReactNode;
  hideIcon?: boolean;
  tone?: KpiTone;
  trend?: KpiTrend;
}) {
  const router = useRouter();
  const iconColor = TONE_ICON_BG[tone];
  const iconEl = isValidElement(icon)
    ? cloneElement(icon as ReactElement<{ className?: string; strokeWidth?: number }>, {
        className: "h-[18px] w-[18px] text-white",
        strokeWidth: 2.25,
      })
    : icon;

  const inner = (
    <>
      {!hideIcon && (
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full shadow-sm ring-1 ring-white/10"
          style={{ backgroundColor: iconColor }}
        >
          {iconEl}
        </span>
      )}
      <div className="mt-3 text-[26px] font-extrabold leading-none tracking-tight text-[var(--crm-text,#17283b)]">{value}</div>
      <div className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-soft,#4b5c71)]">
        {label}
      </div>
      {trend && <TrendRow trend={trend} tone={tone} />}
    </>
  );

  const activeClass = active ? "border-[var(--crm-accent,#3e7ef7)] ring-2 ring-[var(--crm-accent,#3e7ef7)]/40" : "";
  const baseClass = `flex flex-col rounded-2xl border border-[var(--crm-border,#dce4ec)] bg-[var(--crm-surface,#ffffff)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition ${activeClass}`;
  const interactiveClass =
    "cursor-pointer hover:-translate-y-0.5 hover:border-[var(--crm-accent,#3e7ef7)]/30 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--crm-accent,#3e7ef7)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--crm-bg,#f4f7fa)]";

  if (href) {
    return (
      <Link
        href={href}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            router.push(href);
          }
        }}
        className={`${baseClass} ${interactiveClass}`}
      >
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${baseClass} ${interactiveClass} text-left`}>
        {inner}
      </button>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}
