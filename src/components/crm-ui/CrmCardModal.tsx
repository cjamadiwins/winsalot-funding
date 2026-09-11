"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import KpiCard, { type KpiTone, type KpiTrend } from "./KpiCard";

// Shared chrome for every "click a dashboard stat card, see exactly the
// records behind that number" drill-down: the KpiCard trigger (its value
// is always the caller's records.length, never a second count) plus a
// wide, desktop-friendly, in-page modal - same dialog treatment as
// SmartOpportunitiesModal (max-w-5xl, capped height, internal scroll, no
// horizontal overflow) so every card's pop-up looks and behaves the same.
// Used by both the Growth CRM and Lead Generation CRM dashboards so their
// drill-down cards stay visually and behaviorally identical.
export default function CrmCardModal({
  label,
  value,
  tone,
  icon,
  trend,
  title,
  subtitle,
  countLabel,
  children,
}: {
  label: string;
  value: number;
  tone: KpiTone;
  icon: ReactNode;
  // Optional "vs last 7 days" trend row (see KpiCard) - preserves a
  // dashboard's existing trend sparklines (e.g. Lead Gen's admin cards)
  // when the card is converted into one of these drill-down modals.
  trend?: KpiTrend;
  title: string;
  subtitle?: string;
  countLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <KpiCard label={label} value={value} tone={tone} icon={icon} trend={trend} onClick={() => setOpen(true)} />

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-card-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h2 id="crm-card-modal-title" className="text-xl font-bold text-slate-900">
                  {title}
                </h2>
                {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                aria-label={`Close ${title}`}
                className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6">{children}</div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-6">
              <span className="text-[12px] text-slate-500">{countLabel}</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white">
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
