"use client";

import { useEffect, useState } from "react";
import { Clock3, Pencil, RotateCcw } from "lucide-react";
import { resolveLocation, type LocationCountry, type SavedLocation } from "@/lib/timezone-locations";
import type { TimeZonePreferences } from "@/lib/user-time-zone-preferences";
import EditLocationsModal from "./EditLocationsModal";

// Configurable "Client Local Time" panel shown at the top of every
// logged-in CRM dashboard (Cleaning + Lead Gen, admin + agent). Each user
// picks their own two locations via "Edit Locations" (saved to their
// account, so it survives a refresh/logout/new device) or falls back to
// the original Toronto/Vancouver default. Always uses IANA zone names
// (never a fixed UTC offset), so DST and regional exceptions are handled
// by the browser's Intl engine, not by anything hardcoded here.
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
  const zoneAbbr =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short", hour: "2-digit" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return { time, dateLabel, zoneAbbr };
}

// Ticks once a second. Deliberately a plain useState + setInterval
// effect, not useSyncExternalStore with a Date.now() getSnapshot: the
// latter re-invokes getSnapshot() on every render to check for tearing,
// and since Date.now() is different on essentially every call, that
// check itself looks like "the store changed again", forcing another
// synchronous re-render - an infinite loop that trips React's own
// "Maximum update depth exceeded" guard. A once-a-second setState from
// the interval callback has no such problem.
function useTickingClock(): Date | null {
  // Starts null on both the server render and the client's first render
  // (avoids a hydration mismatch - see the "--:--:-- --" placeholder in
  // LocationCard) and is set only from the interval callback below, never
  // synchronously in the effect body itself (react-hooks/set-state-in-effect)
  // - so the real time appears within one second of mount, not on it.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function LocationCard({ location, now }: { location: SavedLocation; now: Date | null }) {
  const formatted = now ? formatClock(now, location.timeZone) : null;
  return (
    <div className="rounded-2xl border-2 border-[var(--crm-border,#dce4ec)] bg-[var(--crm-bg-2,#eaf0f6)] px-4 py-3 shadow-md sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="text-sm font-extrabold text-[var(--crm-text,#17283b)] sm:text-base">{location.city}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--crm-text-muted,#6b7c90)]">
          {location.regionCode}
          {formatted?.zoneAbbr ? ` · ${formatted.zoneAbbr}` : ""}
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
}

export default function ClientLocalTimePanel({
  initialPreferences,
  saveLocationsAction,
  resetLocationsAction,
}: {
  initialPreferences: TimeZonePreferences;
  saveLocationsAction: (
    location1: { country: LocationCountry; regionCode: string; city: string },
    location2: { country: LocationCountry; regionCode: string; city: string }
  ) => Promise<{ error?: string }>;
  resetLocationsAction: () => Promise<{ error?: string }>;
}) {
  const now = useTickingClock();

  const [preferences, setPreferences] = useState(initialPreferences);
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleSave(
    location1: { country: LocationCountry; regionCode: string; city: string },
    location2: { country: LocationCountry; regionCode: string; city: string }
  ) {
    const result = await saveLocationsAction(location1, location2);
    if (!result.error) {
      // Re-derive the resolved {..., timeZone} from the same canonical
      // table the server action validated against, rather than trusting
      // a round trip back from the server - both read the same pure,
      // client-safe lookup, so they can never disagree.
      const resolved1 = resolveLocation(location1.country, location1.regionCode, location1.city);
      const resolved2 = resolveLocation(location2.country, location2.regionCode, location2.city);
      if (resolved1 && resolved2) {
        setPreferences({ location1: resolved1, location2: resolved2 });
      }
    }
    return result;
  }

  async function handleReset() {
    if (resetting) return;
    setResetting(true);
    const result = await resetLocationsAction();
    setResetting(false);
    if (!result.error) {
      setPreferences({
        location1: { country: "CA", regionCode: "ON", city: "Toronto", timeZone: "America/Toronto" },
        location2: { country: "CA", regionCode: "BC", city: "Vancouver", timeZone: "America/Vancouver" },
      });
    }
  }

  return (
    <div className="border-b border-[var(--crm-border,#dce4ec)] bg-[var(--crm-surface,#ffffff)] px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-[var(--crm-text-soft,#4b5c71)]">
          <Clock3 className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          Client Local Time
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-full border border-[var(--crm-border,#dce4ec)] px-3 py-1.5 text-xs font-bold text-[var(--crm-text-soft,#4b5c71)] transition hover:bg-[var(--crm-bg-2,#eaf0f6)]"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
            Edit Locations
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 rounded-full border border-[var(--crm-border,#dce4ec)] px-3 py-1.5 text-xs font-bold text-[var(--crm-text-soft,#4b5c71)] transition hover:bg-[var(--crm-bg-2,#eaf0f6)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} />
            {resetting ? "Resetting…" : "Reset to Toronto & Vancouver"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <LocationCard location={preferences.location1} now={now} />
        <LocationCard location={preferences.location2} now={now} />
      </div>

      {editing && (
        <EditLocationsModal
          location1={preferences.location1}
          location2={preferences.location2}
          onClose={() => setEditing(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
