import { describe, expect, it } from "vitest";
import { composeAppointmentNotes } from "../leadgen-appointment-notes";

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("composeAppointmentNotes", () => {
  it("leaves the notes exactly as typed when no requirements or preference are given", () => {
    expect(composeAppointmentNotes(fd({ appointment_notes: "Call after 2pm" }))).toBe("Call after 2pm");
    expect(composeAppointmentNotes(fd({}))).toBeNull();
    expect(composeAppointmentNotes(fd({ appointment_notes: "   " }))).toBeNull();
  });

  it("puts the primary service requirements and preferred time of day ahead of the notes", () => {
    const notes = composeAppointmentNotes(fd({ appointment_notes: "Prefers phone", service_requirements: "Wants to rank for emergency plumbing in Winnipeg", time_preference: "afternoon" }));
    expect(notes).toBe("Primary service requirements (from the prospect): Wants to rank for emergency plumbing in Winnipeg\n\nProspect's preferred time of day: Afternoon\n\nPrefers phone");
  });

  it("ignores an unknown time preference and keeps requirements on their own", () => {
    expect(composeAppointmentNotes(fd({ service_requirements: "New website", time_preference: "midnight" }))).toBe("Primary service requirements (from the prospect): New website");
  });
});
