// Winsalot Growth CRM consultation-booking slot generation. Same
// architecture as the Lead Gen CRM's /book/[slug] built-in scheduler
// (src/lib/leadgen-booking.ts) - a server-computed list of offered slots,
// re-validated server-side against the same rules on submission so a
// stale page or tampered request can never book outside real availability
// - but every function here is an independent implementation reading
// admin-configurable settings (src/lib/winsalot-consultation-availability.ts)
// instead of a fixed constant schedule, since this system needs a real
// admin settings UI (weekdays, hours, blocked dates/periods, min notice,
// max advance, buffer) that Brent's Essentials' simpler page doesn't.
//
// The one true schedule is always UTC: every slot this file produces is
// a UTC instant. Business hours are configured in a business timezone
// (business_timezone, default America/Toronto) purely for wall-clock
// interpretation of "9am-5pm"; a prospect's own local display conversion
// happens client-side from the UTC value, never here.

import type { WinsalotAvailabilitySettingsRow, WinsalotBlackoutRow } from "./winsalot-consultation-types";

export const WINSALOT_SLOT_MINUTES = 15;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Converts a wall-clock date+time as it would read in `timeZone` to the
// UTC epoch millisecond it actually represents. Converges in at most two
// iterations since IANA DST offsets only ever shift by whole/half hours.
// Independent implementation of the same technique used by the Lead Gen
// CRM's zonedWallTimeToUtcMs (src/lib/leadgen-appointment-reminders.ts).
export function zonedWallTimeToUtcMs(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guessMs = targetMs;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guessMs)).map((p) => [p.type, p.value]));
    const shownMs = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const diff = shownMs - targetMs;
    if (diff === 0) break;
    guessMs -= diff;
  }
  return guessMs;
}

// "Now," expressed as the wall-clock date/time tuple in `timeZone`.
function nowInTz(timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

export type WinsalotBookingSlot = {
  startUtcIso: string;
  endUtcIso: string;
};

type ExistingRange = { startMs: number; endMs: number };

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// The full set of currently-offered slots (UTC instants), honoring every
// admin-configured rule: weekdays, business hours, minimum notice,
// maximum advance booking range, buffer time around existing bookings,
// and blocked dates/periods. `existingBookings` should be every
// non-cancelled appointment's [start, end) range; `blackouts` every
// admin-configured blocked window - both already UTC.
export function generateWinsalotBookingSlots(
  settings: WinsalotAvailabilitySettingsRow,
  blackouts: Pick<WinsalotBlackoutRow, "start_at" | "end_at">[],
  existingBookings: ExistingRange[],
  now: Date = new Date()
): WinsalotBookingSlot[] {
  const tz = settings.business_timezone;
  const [startHour, startMinute] = settings.business_start_time.split(":").map(Number);
  const [endHour, endMinute] = settings.business_end_time.split(":").map(Number);
  const startMinutesOfDay = startHour * 60 + startMinute;
  const endMinutesOfDay = endHour * 60 + endMinute;

  const nowMs = now.getTime();
  const minStartMs = nowMs + settings.min_notice_minutes * 60_000;
  const maxStartMs = nowMs + settings.max_advance_days * 24 * 60 * 60_000;

  const blackoutRanges: ExistingRange[] = blackouts.map((b) => ({
    startMs: new Date(b.start_at).getTime(),
    endMs: new Date(b.end_at).getTime(),
  }));

  const bufferMs = settings.buffer_minutes * 60_000;
  const bufferedBookings: ExistingRange[] = existingBookings.map((b) => ({
    startMs: b.startMs - bufferMs,
    endMs: b.endMs + bufferMs,
  }));

  const today = nowInTz(tz);
  const slots: WinsalotBookingSlot[] = [];

  // +1 so a max_advance_days boundary that lands mid-day is still fully
  // scanned rather than cut off by the day loop itself (the per-slot
  // maxStartMs check below is the real cutoff).
  const dayCount = settings.max_advance_days + 1;

  for (let offset = 0; offset < dayCount; offset++) {
    const cursor = new Date(today.year, today.month - 1, today.day + offset);
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const day = cursor.getDate();

    if (!settings.available_weekdays.includes(weekdayOf(year, month, day))) continue;

    for (let minutes = startMinutesOfDay; minutes + WINSALOT_SLOT_MINUTES <= endMinutesOfDay; minutes += WINSALOT_SLOT_MINUTES) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const startMs = zonedWallTimeToUtcMs(year, month, day, hour, minute, tz);
      const endMs = startMs + WINSALOT_SLOT_MINUTES * 60_000;

      if (startMs < minStartMs) continue;
      if (startMs > maxStartMs) continue;
      if (blackoutRanges.some((b) => overlaps(startMs, endMs, b.startMs, b.endMs))) continue;
      if (bufferedBookings.some((b) => overlaps(startMs, endMs, b.startMs, b.endMs))) continue;

      slots.push({ startUtcIso: new Date(startMs).toISOString(), endUtcIso: new Date(endMs).toISOString() });
    }
  }

  return slots;
}

// Re-derives the offered slots and checks whether a submitted UTC start
// time is genuinely one of them right now - the source of truth every
// booking action (public self-booking, agent/admin booking, reschedule)
// validates against, so a tampered client request or a slot someone else
// just grabbed can never book outside real availability.
export function isWinsalotSlotOffered(
  startUtcIso: string,
  settings: WinsalotAvailabilitySettingsRow,
  blackouts: Pick<WinsalotBlackoutRow, "start_at" | "end_at">[],
  existingBookings: ExistingRange[],
  now: Date = new Date()
): boolean {
  const slots = generateWinsalotBookingSlots(settings, blackouts, existingBookings, now);
  return slots.some((s) => s.startUtcIso === startUtcIso);
}

export function winsalotSlotEndIso(startUtcIso: string): string {
  return new Date(new Date(startUtcIso).getTime() + WINSALOT_SLOT_MINUTES * 60_000).toISOString();
}

export function isoDateForToday(timeZone: string): string {
  const { year, month, day } = nowInTz(timeZone);
  return isoDate(year, month, day);
}
