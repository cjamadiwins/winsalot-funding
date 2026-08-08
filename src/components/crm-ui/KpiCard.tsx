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

export default function KpiCard({
  label,
  value,
  href,
  onClick,
  active,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  icon: ReactNode;
  tone?: KpiTone;
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
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full shadow-sm ring-1 ring-white/10"
        style={{ backgroundColor: iconColor }}
      >
        {iconEl}
      </span>
      <div className="mt-3 text-[26px] font-extrabold leading-none tracking-tight text-white">{value}</div>
      <div className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-soft,#c3d0e3)]">
        {label}
      </div>
    </>
  );

  const activeClass = active ? "border-[var(--crm-accent,#3e7ef7)] ring-2 ring-[var(--crm-accent,#3e7ef7)]/40" : "";
  const baseClass = `flex flex-col rounded-2xl border border-[var(--crm-border,#3d5878)] bg-[var(--crm-surface,#304963)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition ${activeClass}`;
  const interactiveClass =
    "cursor-pointer hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--crm-accent,#3e7ef7)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--crm-bg,#263b55)]";

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
