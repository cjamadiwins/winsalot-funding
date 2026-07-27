// Lead Generation CRM: pure slot-generation logic for the public
// consultation booking page. Deliberately no timezone-conversion library
// - dates/times are generated and stored as plain wall-clock values (see
// leadgen_appointments.appointment_date/appointment_time/timezone in
// supabase/migrations/0031_leadgen_crm.sql), exactly like every other
// appointment-booking form already in this CRM. No "server-only" tag:
// both the booking page's client component (to render the picker) and
// its server action (to re-validate the submitted slot) import this.

export const LEADGEN_BOOKING_TIMEZONE = "America/Toronto";
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 17; // last bookable slot starts 30 min before this
const SLOT_MINUTES = 30;
const DAYS_AHEAD = 14;

export type LeadgenBookingSlot = { date: string; time: string; label: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// Every slot in the business day, e.g. "09:00", "09:30", ... up to (but
// not including) BUSINESS_END_HOUR.
function timesForDay(): string[] {
  const times: string[] = [];
  for (let minutes = BUSINESS_START_HOUR * 60; minutes < BUSINESS_END_HOUR * 60; minutes += SLOT_MINUTES) {
    times.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return times;
}

function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period}`;
}

// Every weekday (Mon-Fri) business-hours slot for the next DAYS_AHEAD
// calendar days, starting tomorrow (today is never offered, so a
// prospect can never "book" a slot that's already passed or minutes
// away), minus any slot already taken by a non-cancelled appointment.
export function generateAvailableSlots(
  bookedSlots: { date: string; time: string; status?: string }[] = [],
  from: Date = new Date()
): LeadgenBookingSlot[] {
  const bookedSet = new Set(
    bookedSlots.filter((s) => s.status !== "Cancelled").map((s) => `${s.date}T${s.time}`)
  );
  const slots: LeadgenBookingSlot[] = [];
  const times = timesForDay();

  for (let dayOffset = 1; dayOffset <= DAYS_AHEAD; dayOffset++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + dayOffset);
    const weekday = d.getDay(); // 0 Sun .. 6 Sat
    if (weekday === 0 || weekday === 6) continue;
    const dateStr = toDateString(d.getFullYear(), d.getMonth(), d.getDate());
    for (const time of times) {
      if (bookedSet.has(`${dateStr}T${time}`)) continue;
      slots.push({ date: dateStr, time, label: timeLabel(time) });
    }
  }

  return slots;
}

export function formatLeadgenSlotLabel(date: string, time: string): string {
  const d = new Date(`${date}T00:00:00`);
  const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return `${dateLabel} at ${timeLabel(time)}`;
}
