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
    <div className="border-b border-[var(--crm-border,#dce4ec)] bg-[var(--crm-surface,#ffffff)] px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted,#6b7c90)]">
          <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          Client Local Time
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6">
          {CLOCKS.map((clock) => {
            const formatted = now ? formatClock(now, clock.timeZone) : null;
            return (
              <div key={clock.timeZone} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[12.5px] font-semibold text-[var(--crm-text,#17283b)]">
                  {clock.city}
                  <span className="ml-1 font-normal text-[var(--crm-text-muted,#6b7c90)]">({clock.region})</span>
                </span>
                <span
                  className="font-mono text-lg font-bold tabular-nums text-[var(--crm-accent,#3e7ef7)] sm:text-xl"
                  suppressHydrationWarning
                >
                  {formatted ? formatted.time : "--:--:-- --"}
                </span>
                <span className="text-[11.5px] text-[var(--crm-text-muted,#6b7c90)]" suppressHydrationWarning>
                  {formatted ? formatted.dateLabel : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
