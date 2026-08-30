"use client";

import { useEffect, useState } from "react";
import {
  Clock3,
  Pencil,
  RotateCcw,
  Globe2,
  Briefcase,
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudLightning,
  Snowflake,
  CloudFog,
  type LucideIcon,
} from "lucide-react";
import {
  resolveLocation,
  findCity,
  findRegion,
  countryName,
  type LocationCountry,
  type SavedLocation,
} from "@/lib/timezone-locations";
import { getNigeriaTimeDiffLabel, getCallingStatus, BUSINESS_HOURS_LABEL, type CallingStatusLevel } from "@/lib/market-snapshot";
import type { TimeZonePreferences } from "@/lib/user-time-zone-preferences";
import EditLocationsModal from "./EditLocationsModal";
import CitySkyline, { isNightAt } from "./CitySkyline";
import CityPhoto from "./CityPhoto";
import FlagIcon from "./FlagIcon";

// Refresh interval for each card's live weather - "a sensible interval,
// such as every 30 minutes," not every second.
const WEATHER_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

type WeatherIconKind = "sun" | "moon" | "partly-cloudy-day" | "partly-cloudy-night" | "cloudy" | "drizzle" | "rain" | "thunderstorm" | "snow" | "fog";

const WEATHER_ICONS: Record<WeatherIconKind, LucideIcon> = {
  sun: Sun,
  moon: Moon,
  "partly-cloudy-day": CloudSun,
  "partly-cloudy-night": CloudMoon,
  cloudy: Cloud,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  thunderstorm: CloudLightning,
  snow: Snowflake,
  fog: CloudFog,
};

// WMO weather codes (https://open-meteo.com/en/docs, "WMO Weather
// interpretation codes") mapped to the plain-language condition labels
// this card shows and one icon from the small set above.
function mapWeatherCode(code: number, isDay: boolean): { condition: string; icon: WeatherIconKind } {
  if (code === 0) return isDay ? { condition: "Sunny", icon: "sun" } : { condition: "Clear", icon: "moon" };
  if (code === 1 || code === 2) return { condition: "Partly Cloudy", icon: isDay ? "partly-cloudy-day" : "partly-cloudy-night" };
  if (code === 3) return { condition: "Cloudy", icon: "cloudy" };
  if (code === 45 || code === 48) return { condition: "Foggy", icon: "fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { condition: "Drizzle", icon: "drizzle" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { condition: "Rainy", icon: "rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { condition: "Snowing", icon: "snow" };
  if ([95, 96, 99].includes(code)) return { condition: "Thunderstorms", icon: "thunderstorm" };
  return { condition: "Cloudy", icon: "cloudy" };
}

type CityWeather = { condition: string; icon: WeatherIconKind; tempC: number };

// Open-Meteo (https://open-meteo.com) - free, no API key, so there's
// nothing to keep out of browser-side code and no server route needed;
// the browser calls it directly. Fetches on mount, whenever the city
// itself changes (this hook is keyed by lat/lon), and every 30 minutes
// after that. Keeps the last good reading on screen while a refresh is
// in flight rather than flashing a loading state every 30 minutes, and
// only shows the graceful fallback when a fetch actually fails.
function useCityWeather(lat: number, lon: number): { data: CityWeather | null; error: boolean } {
  const [data, setData] = useState<CityWeather | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&temperature_unit=celsius&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Open-Meteo request failed");
        const json = await response.json();
        const current = json?.current;
        if (typeof current?.temperature_2m !== "number" || typeof current?.weather_code !== "number") {
          throw new Error("Unexpected Open-Meteo response shape");
        }
        if (cancelled) return;
        const { condition, icon } = mapWeatherCode(current.weather_code, current.is_day === 1);
        setError(false);
        setData({ condition, icon, tempC: current.temperature_2m });
      } catch {
        if (!cancelled) setError(true);
      }
    }

    load();
    const id = setInterval(load, WEATHER_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lat, lon]);

  return { data, error };
}

// The weather line within each Client Local Time card, under the clock:
// icon + condition + current temperature in Celsius. Deliberately just
// these three - kept simple, not crowding the card's existing clock,
// skyline, and Market Snapshot content. Purely presentational - the
// caller (LocationCard) owns the useCityWeather call so both this and
// the photoHero variant's overlay share one fetch instead of each
// mounting its own.
function WeatherLine({ data, error }: { data: CityWeather | null; error: boolean }) {
  const Icon = data ? WEATHER_ICONS[data.icon] : null;

  if (error) {
    return <p className="mt-1.5 text-[11px] font-medium text-[var(--crm-text-muted,#6b7c90)]">Weather temporarily unavailable</p>;
  }

  if (!data || !Icon) {
    return <div className="mt-1.5 h-5 w-32 animate-pulse rounded bg-[var(--crm-bg-2,#eaf0f6)]" aria-hidden="true" />;
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5" suppressHydrationWarning>
      <Icon className="h-5 w-5 shrink-0 text-[var(--crm-accent,#3e7ef7)]" strokeWidth={2} aria-hidden="true" />
      <span className="text-[13px] font-bold text-[var(--crm-text,#17283b)]">{Math.round(data.tempC)}°C</span>
      <span className="text-[12px] font-semibold text-[var(--crm-text-soft,#4b5c71)]">{data.condition}</span>
    </div>
  );
}

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

const CALLING_STATUS_BADGE_CLASSES: Record<CallingStatusLevel, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-300",
  yellow: "bg-amber-100 text-amber-800 border-amber-300",
  red: "bg-rose-100 text-rose-700 border-rose-300",
  weekend: "bg-slate-100 text-slate-600 border-slate-300",
};

const CALLING_STATUS_DOT_CLASSES: Record<CallingStatusLevel, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  weekend: "bg-slate-400",
};

function LocationCard({
  location,
  now,
  photoHero,
  hideNigeriaComparison,
}: {
  location: SavedLocation;
  now: Date | null;
  photoHero?: boolean;
  // Client Portal only (brief: "The Client Portal should not reference
  // Lagos or agent locations") - the Nigeria time-difference line only
  // makes sense from a Winsalot calling agent's own point of view, never
  // to a Winsalot client viewing their own campaign portal. Every other
  // dashboard (Growth CRM, Lead Gen CRM admin/agent) keeps it unchanged.
  hideNigeriaComparison?: boolean;
}) {
  const formatted = now ? formatClock(now, location.timeZone) : null;
  const region = findRegion(location.country, location.regionCode);
  const city = findCity(location.country, location.regionCode, location.city);
  const callingStatus = now ? getCallingStatus(now, location.timeZone) : null;
  const nigeriaDiff = now && !hideNigeriaComparison ? getNigeriaTimeDiffLabel(now, location.timeZone) : null;
  // Always called (rules of hooks) - falls back to 0,0 when the location
  // hasn't resolved to a known city yet; the `city &&` guards below just
  // skip rendering the result in that edge case, same as before.
  const weather = useCityWeather(city?.lat ?? 0, city?.lon ?? 0);

  if (photoHero) {
    const WeatherIcon = weather.data ? WEATHER_ICONS[weather.data.icon] : null;
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--crm-border,#dce4ec)] bg-[var(--crm-surface,#ffffff)] shadow-lg">
        <CityPhoto
          seed={`${location.country}-${location.regionCode}-${location.city}`}
          alt={`${location.city} skyline`}
          priority
        />

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--crm-text,#17283b)] sm:text-sm">
              <FlagIcon country={location.country} className="h-4 w-6" />
              {location.city}
            </div>
            {WeatherIcon && (
              <WeatherIcon className="h-6 w-6 shrink-0 text-[var(--crm-accent,#3e7ef7)]" strokeWidth={1.8} aria-hidden="true" />
            )}
          </div>

          <div
            className="mt-2 font-mono text-[28px] font-extrabold leading-none tabular-nums text-[var(--crm-accent,#3e7ef7)] sm:text-[33px]"
            suppressHydrationWarning
          >
            {formatted ? formatted.time : "--:--:-- --"}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2.5" suppressHydrationWarning>
            {weather.error ? (
              <span className="text-[12px] font-semibold text-[var(--crm-text-muted,#6b7c90)]">Weather unavailable</span>
            ) : weather.data ? (
              <>
                <span className="text-[14px] font-bold text-[var(--crm-text-soft,#4b5c71)]">{weather.data.condition}</span>
                <span className="text-[18px] font-extrabold text-[var(--crm-text,#17283b)]">{Math.round(weather.data.tempC)}°C</span>
              </>
            ) : (
              <span className="text-[12px] font-semibold text-[var(--crm-text-muted,#6b7c90)]">Loading…</span>
            )}
          </div>

          <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--crm-text-muted,#6b7c90)]" suppressHydrationWarning>
            {region?.name ?? location.regionCode}, {countryName(location.country)}
            {formatted ? ` · ${formatted.dateLabel} · ${formatted.zoneAbbr}` : ""}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-[var(--crm-border,#dce4ec)] pt-2.5" suppressHydrationWarning>
            {nigeriaDiff && <span className="text-[11px] font-semibold text-[var(--crm-text-soft,#4b5c71)]">{nigeriaDiff}</span>}
            <span className="text-[11px] font-semibold text-[var(--crm-text-soft,#4b5c71)]">{BUSINESS_HOURS_LABEL}</span>
            {callingStatus && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${CALLING_STATUS_BADGE_CLASSES[callingStatus.level]}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CALLING_STATUS_DOT_CLASSES[callingStatus.level]}`} aria-hidden="true" />
                {callingStatus.label}
              </span>
            )}
          </div>
          {city?.fact && <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--crm-text-muted,#6b7c90)]">{city.fact}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-[var(--crm-border,#dce4ec)] bg-[var(--crm-bg-2,#eaf0f6)] shadow-md">
      <CitySkyline
        seed={`${location.country}-${location.regionCode}-${location.city}`}
        night={now ? isNightAt(now, location.timeZone) : false}
        className="h-14 w-full sm:h-16"
      />

      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-1.5">
          <FlagIcon country={location.country} className="h-4 w-6" />
          <span className="text-sm font-extrabold text-[var(--crm-text,#17283b)] sm:text-base">{location.city}</span>
        </div>
        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted,#6b7c90)]">
          {region?.name ?? location.regionCode}, {countryName(location.country)}
        </div>

        <div
          className="mt-2 font-mono text-[28px] font-extrabold leading-none tabular-nums text-[var(--crm-accent,#3e7ef7)] sm:text-[32px]"
          suppressHydrationWarning
        >
          {formatted ? formatted.time : "--:--:-- --"}
        </div>
        <div className="mt-1.5 text-xs font-medium text-[var(--crm-text-muted,#6b7c90)] sm:text-sm" suppressHydrationWarning>
          {formatted ? `${formatted.dateLabel} · ${formatted.zoneAbbr}` : ""}
        </div>

        {city && <WeatherLine data={weather.data} error={weather.error} />}

        {/* Market Snapshot */}
        <div className="mt-3 space-y-1.5 border-t border-[var(--crm-border,#dce4ec)] pt-2.5" suppressHydrationWarning>
          {!hideNigeriaComparison && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--crm-text-soft,#4b5c71)] sm:text-xs">
              <Globe2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              {nigeriaDiff ?? "—"}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--crm-text-soft,#4b5c71)] sm:text-xs">
            <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            {BUSINESS_HOURS_LABEL}
          </div>
          {callingStatus && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold sm:text-[11px] ${CALLING_STATUS_BADGE_CLASSES[callingStatus.level]}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CALLING_STATUS_DOT_CLASSES[callingStatus.level]}`} aria-hidden="true" />
              {callingStatus.label}
            </span>
          )}
          {city?.fact && (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--crm-text-muted,#6b7c90)] sm:text-xs">
              <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              <span>{city.fact}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClientLocalTimePanel({
  initialPreferences,
  saveLocationsAction,
  resetLocationsAction,
  cardVariant = "default",
  hideNigeriaComparison = false,
}: {
  initialPreferences: TimeZonePreferences;
  saveLocationsAction: (
    location1: { country: LocationCountry; regionCode: string; city: string },
    location2: { country: LocationCountry; regionCode: string; city: string }
  ) => Promise<{ error?: string }>;
  resetLocationsAction: () => Promise<{ error?: string }>;
  cardVariant?: "default" | "photoHero";
  // Client Portal only - see LocationCard's own comment for why. Defaults
  // to false (unchanged) everywhere else.
  hideNigeriaComparison?: boolean;
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
        <LocationCard location={preferences.location1} now={now} photoHero={cardVariant === "photoHero"} hideNigeriaComparison={hideNigeriaComparison} />
        <LocationCard location={preferences.location2} now={now} photoHero={cardVariant === "photoHero"} hideNigeriaComparison={hideNigeriaComparison} />
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
