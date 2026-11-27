// Internal appointment notes as booked from the lead page. The booking form
// can also carry the prospect's primary service requirements and preferred
// part of the day; they are written into the appointment's internal notes
// (which feed the appointment preparation brief). With neither field present
// the notes are exactly what the agent typed, as before.

export const TIME_PREFERENCES = ["morning", "afternoon"] as const;
export type TimePreference = (typeof TIME_PREFERENCES)[number];

function clean(value: unknown, max: number): string | null {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  return text ? text.slice(0, max) : null;
}

export function composeAppointmentNotes(formData: FormData): string | null {
  const notes = clean(formData.get("appointment_notes"), 4000);
  const requirements = clean(formData.get("service_requirements"), 1500);
  const rawPart = String(formData.get("time_preference") ?? "").trim();
  const part = (TIME_PREFERENCES as readonly string[]).includes(rawPart) ? (rawPart as TimePreference) : null;
  const lines = [
    requirements ? `Primary service requirements (from the prospect): ${requirements}` : null,
    part ? `Prospect's preferred time of day: ${part === "morning" ? "Morning" : "Afternoon"}` : null,
    notes,
  ].filter((l): l is string => Boolean(l));
  return lines.length > 0 ? lines.join("\n\n") : null;
}
