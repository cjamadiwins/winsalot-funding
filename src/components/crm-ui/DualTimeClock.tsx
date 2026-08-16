"use client";

import { useSyncExternalStore } from "react";
import { Clock3 } from "lucide-react";

// Live Toronto (Eastern) + British Columbia (Pacific) clocks shown at the
// top of every CRM dashboard so Nigeria-based agents can see the current
// Canadian calling time at a glance. Uses IANA zone names (not fixed UTC
// offsets) so DST transitions in either zone are handled automatically by
// the browser's Intl engine.
const CLOCKS = [
  { city: "Toronto", region: "Eastern Time", timeZone: "America/Toronto" },
  { city: "British Columbia", region: "Pacific Time", timeZone: "America/Vancouver" },
] as const;

function formatClock(date: Date, timeZone: string) {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  return { time, dateLabel };
}

function subscribeToClock(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}

function getClockSnapshot() {
  return Date.now();
}

// Server render has no "current time" to be correct about, so it reports
// null - useSyncExternalStore then re-reads the real client clock right
// after hydration without triggering a hydration mismatch.
function getServerClockSnapshot() {
  return null;
}

export default function DualTimeClock() {
  const nowMs = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const now = nowMs === null ? null : new Date(nowMs);

  return (
    <div className="border-b border-[var(--crm-border,#dce4ec)] bg-[var(--crm-surface,#ffffff)] px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-[var(--crm-text-soft,#4b5c71)]">
        <Clock3 className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        Client Local Time
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {CLOCKS.map((clock) => {
          const formatted = now ? formatClock(now, clock.timeZone) : null;
          return (
            <div
              key={clock.timeZone}
              className="rounded-2xl border-2 border-[var(--crm-border,#dce4ec)] bg-[var(--crm-bg-2,#eaf0f6)] px-4 py-3 shadow-md sm:px-5 sm:py-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="text-sm font-extrabold text-[var(--crm-text,#17283b)] sm:text-base">{clock.city}</span>
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--crm-text-muted,#6b7c90)]">
                  {clock.region}
                </span>
              </div>
              <div
                className="mt-1 font-mono text-[28px] font-extrabold leading-none tabular-nums text-[var(--crm-accent,#3e7ef7)] sm:text-[32px]"
                suppressHydrationWarning
              >
                {formatted ? formatted.time : "--:--:-- --"}
              </div>
              <div className="mt-1.5 text-xs font-medium text-[var(--crm-text-muted,#6b7c90)] sm:text-sm" suppressHydrationWarning>
                {formatted ? formatted.dateLabel : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
