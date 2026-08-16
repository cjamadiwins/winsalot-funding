// Pure helpers behind each Client Local Time card's "Market Snapshot":
// the time difference from Nigeria (where this CRM's calling agents are
// based - see DualTimeClock's original commit message), and a calling-
// status traffic light derived from the selected city's real local time.
// Every calculation reads the city's actual IANA time zone at the given
// instant, never a fixed UTC offset, so DST transitions on either side
// (the city's or Nigeria's, though Nigeria itself has never observed
// DST) are always reflected correctly.

export const NIGERIA_TIME_ZONE = "Africa/Lagos";

export const BUSINESS_HOURS_LABEL = "9:00 AM – 5:00 PM (Mon–Fri)";

// A time zone's current UTC offset, in minutes, computed from the actual
// wall-clock reading in that zone rather than a lookup table - this is
// what makes it DST-correct without hardcoding any transition dates.
export function getUtcOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

// "5h ahead of Lagos" / "2h 30m behind Lagos" / "Same time as Lagos".
export function getNigeriaTimeDiffLabel(date: Date, timeZone: string): string {
  const diffMinutes = getUtcOffsetMinutes(date, timeZone) - getUtcOffsetMinutes(date, NIGERIA_TIME_ZONE);
  if (diffMinutes === 0) return "Same time as Lagos, Nigeria";

  const abs = Math.abs(diffMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const duration = minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  return diffMinutes > 0 ? `${duration} ahead of Lagos` : `${duration} behind Lagos`;
}

export type CallingStatusLevel = "green" | "yellow" | "red" | "weekend";

export type CallingStatus = {
  level: CallingStatusLevel;
  label: string;
};

// Green: solidly within 9am-5pm local on a weekday. Yellow: inside the
// first or last hour of the business day. Red: outside 9-5 on a weekday.
// Weekend (the city's local Saturday/Sunday, not the caller's) gets its
// own message rather than reusing red - "closed for the weekend" reads
// differently to an agent than "you've called too late tonight."
export function getCallingStatus(date: Date, timeZone: string): CallingStatus {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  if (weekday === "Sat" || weekday === "Sun") {
    return { level: "weekend", label: "Weekend — businesses may be closed" };
  }
  if (hour < 9 || hour >= 17) {
    return { level: "red", label: "Outside normal business hours" };
  }
  if (hour === 9 || hour === 16) {
    return { level: "yellow", label: "Near the beginning/end of business hours" };
  }
  return { level: "green", label: "Good time to call" };
}
