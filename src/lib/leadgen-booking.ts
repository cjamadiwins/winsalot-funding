// Built-in consultation booking page (/book/[slug]) - shared, client-safe
// slot-generation logic used by both the public page (to list available
// dates/times) and its server action (to re-validate a submission against
// the same rules server-side, never trusting the client's selection
// blindly). Deliberately simple - a fixed weekly schedule, no per-client
// configuration UI - since Brent's Essentials is the only real client
// today; a future client needing different hours would need this file
// extended to read per-client settings rather than this single constant
// schedule.

export const LEADGEN_BOOKING_TIMEZONE = "America/Toronto";
export const LEADGEN_BOOKING_TIMEZONE_LABEL = "ET";
const BUSINESS_START_HOUR = 9; // 9:00 AM
const BUSINESS_END_HOUR = 17; // 5:00 PM (last bookable slot starts at 16:45)
const SLOT_MINUTES = 15;
const LOOKAHEAD_CALENDAR_DAYS = 21; // scanned to find the next 10 weekdays
const WEEKDAYS_OFFERED = 10;
const MIN_LEAD_TIME_MS = 2 * 60 * 60 * 1000; // 2 hours' notice

export type LeadgenBookingDay = {
  date: string; // YYYY-MM-DD
  label: string; // "Mon, Aug 4"
  times: string[]; // "HH:MM" 24h, business timezone
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "Now" expressed as the wall-clock date/time in LEADGEN_BOOKING_TIMEZONE.
function nowInBookingTz(): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEADGEN_BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute };
}

// Naive UTC-equivalent milliseconds for a wall-clock tuple, used only to
// compare two moments *within the same timezone* (e.g. "now" vs. a
// candidate slot) - both sides carry the same DST offset error, if any,
// so a difference computed this way is accurate to within an hour even
// across a DST transition, which is more than sufficient for a lead-time
// cutoff (never a financial/legal-precision calculation).
function naiveMs(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month - 1, day, hour, minute);
}

function dateLabel(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isWeekday(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay();
  return dow >= 1 && dow <= 5;
}

function allSlotsForDay(): string[] {
  const times: string[] = [];
  for (let minutes = BUSINESS_START_HOUR * 60; minutes < BUSINESS_END_HOUR * 60; minutes += SLOT_MINUTES) {
    times.push(`${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`);
  }
  return times;
}

// The next WEEKDAYS_OFFERED business days (starting today, if there's
// still bookable time left today), each with every slot the fixed
// schedule allows - not yet filtered against existing bookings, which
// the caller does via excludeBooked (a Set of "YYYY-MM-DD|HH:MM" keys
// pulled from leadgen_appointments for the date range covered).
export function generateLeadgenBookingDays(excludeBooked: Set<string> = new Set()): LeadgenBookingDay[] {
  const now = nowInBookingTz();
  const nowMs = naiveMs(now.year, now.month, now.day, now.hour, now.minute);
  const days: LeadgenBookingDay[] = [];
  const template = allSlotsForDay();

  for (let offset = 0; offset < LOOKAHEAD_CALENDAR_DAYS && days.length < WEEKDAYS_OFFERED; offset++) {
    const cursor = new Date(now.year, now.month - 1, now.day + offset);
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const day = cursor.getDate();
    if (!isWeekday(year, month, day)) continue;

    const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
    const times = template.filter((time) => {
      const [h, m] = time.split(":").map(Number);
      const slotMs = naiveMs(year, month, day, h, m);
      if (slotMs - nowMs < MIN_LEAD_TIME_MS) return false;
      if (excludeBooked.has(`${dateStr}|${time}`)) return false;
      return true;
    });

    if (times.length > 0) {
      days.push({ date: dateStr, label: dateLabel(year, month, day), times });
    }
  }

  return days;
}

// Re-derives the same offered days/times server-side and checks whether
// a submitted (date, time) is actually one of them - the source of truth
// the booking action validates against, so a tampered client request
// (or a slot someone else grabbed a second ago) can never book outside
// the real schedule.
export function isLeadgenBookingSlotOffered(date: string, time: string, excludeBooked: Set<string> = new Set()): boolean {
  const days = generateLeadgenBookingDays(excludeBooked);
  const day = days.find((d) => d.date === date);
  return !!day && day.times.includes(time);
}

export function formatLeadgenBookingSlot(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const label = dateLabel(year, month, day);
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${label} at ${displayHour}:${pad2(minute)} ${ampm} ${LEADGEN_BOOKING_TIMEZONE_LABEL}`;
}
