import { describe, expect, it } from "vitest";
import {
  buildBriefEmailBody,
  buildLifecycle,
  computeFeedbackMetrics,
  computeQualityInsights,
  deriveFeedbackStatus,
  hasAppointmentPassed,
  isBriefContentComplete,
  parseLineList,
  safeClientNextPath,
  summarizePrep,
  toClientBriefView,
  type AppointmentBriefRow,
  type AppointmentFeedbackRow,
} from "../leadgen-appointment-prep";

const NOW = new Date("2026-10-01T15:00:00Z"); // 11:00 in America/Toronto

function appt(id: string, date: string, time: string, status = "Booked", timezone = "America/Toronto") {
  return { id, appointment_date: date, appointment_time: time, timezone, status };
}

function feedback(partial: Partial<AppointmentFeedbackRow> & { appointment_id: string }): AppointmentFeedbackRow {
  return {
    id: partial.appointment_id,
    client_id: "c1",
    outcome: "Other",
    what_happened: null,
    opportunity_quality: null,
    fit_issues: [],
    future_notes: null,
    submitted_by: null,
    submitted_at: "2026-09-30T12:00:00Z",
    updated_at: "2026-09-30T12:00:00Z",
    ...partial,
  };
}

describe("parseLineList", () => {
  it("trims, strips bullets/numbering, drops blanks and caps the count", () => {
    expect(parseLineList("- One\n2. Two\n\n  • Three  \nFour", 3)).toEqual(["One", "Two", "Three"]);
  });
});

describe("hasAppointmentPassed", () => {
  it("compares in the appointment's own timezone", () => {
    expect(hasAppointmentPassed(appt("a", "2026-10-01", "10:59"), NOW)).toBe(true);
    expect(hasAppointmentPassed(appt("a", "2026-10-01", "11:30"), NOW)).toBe(false);
    expect(hasAppointmentPassed(appt("a", "2026-10-02", "09:00"), NOW)).toBe(false);
  });
  it("treats a Completed appointment as passed and falls back safely on a bad timezone", () => {
    expect(hasAppointmentPassed(appt("a", "2027-01-01", "09:00", "Completed"), NOW)).toBe(true);
    expect(hasAppointmentPassed(appt("a", "2026-09-30", "09:00", "Booked", "Not/AZone"), NOW)).toBe(true);
  });
});

describe("feedback status is separate from appointment status", () => {
  it("is null before the appointment, pending after it, received once submitted", () => {
    expect(deriveFeedbackStatus(appt("a", "2026-10-05", "09:00"), null, NOW)).toBeNull();
    expect(deriveFeedbackStatus(appt("a", "2026-09-30", "09:00"), null, NOW)).toBe("feedback_pending");
    expect(deriveFeedbackStatus(appt("a", "2026-09-30", "09:00"), { submitted_at: "x" }, NOW)).toBe("feedback_received");
  });
  it("never applies to cancelled/replaced appointments", () => {
    expect(deriveFeedbackStatus(appt("a", "2026-09-30", "09:00", "Cancelled"), null, NOW)).toBeNull();
    expect(deriveFeedbackStatus(appt("a", "2026-09-30", "09:00", "Replaced"), null, NOW)).toBeNull();
  });
});

describe("summarizePrep", () => {
  it("counts only upcoming, preparable appointments; missing brief = needs preparation", () => {
    const summary = summarizePrep(
      [
        appt("1", "2026-10-03", "09:00"),
        appt("2", "2026-10-03", "10:00"),
        appt("3", "2026-10-04", "10:00"),
        appt("4", "2026-10-04", "11:00"),
        appt("past", "2026-09-01", "09:00"),
        appt("cancelled", "2026-10-06", "09:00", "Cancelled"),
      ],
      { "1": "brief_ready", "3": "client_viewed", "4": "sent_to_client", past: "brief_ready", cancelled: "brief_ready" },
      NOW
    );
    expect(summary).toEqual({ ready: 1, needsPreparation: 1, sent: 1, viewed: 1 });
  });
});

describe("client brief isolation", () => {
  const row: AppointmentBriefRow = {
    id: "b",
    appointment_id: "a",
    client_id: "c1",
    why_interested: "Wants more inquiries",
    primary_opportunity: "SEO",
    interest_level: "High",
    recommended_objective: "Secure a proposal opportunity",
    appointment_summary: "Owner asked about pricing",
    talking_points: ["p1"],
    suggested_questions: ["q1"],
    recommended_next_step: "Send Proposal",
    next_step_note: null,
    prep_status: "sent_to_client",
    prepared_by: "admin-user-id",
    sent_at: "2026-10-01T00:00:00Z",
    sent_by: "admin-user-id",
    viewed_at: null,
    created_at: "x",
    updated_at: "y",
  };
  it("toClientBriefView exposes no internal/CRM metadata", () => {
    const view = toClientBriefView(row);
    expect(Object.keys(view).sort()).toEqual(
      [
        "appointment_summary",
        "interest_level",
        "next_step_note",
        "primary_opportunity",
        "prep_status",
        "recommended_next_step",
        "recommended_objective",
        "suggested_questions",
        "talking_points",
        "why_interested",
      ].sort()
    );
    expect(JSON.stringify(view)).not.toContain("admin-user-id");
    expect(JSON.stringify(view)).not.toContain("c1");
  });
  it("isBriefContentComplete needs why, opportunity and at least one point/question", () => {
    expect(isBriefContentComplete(toClientBriefView(row))).toBe(true);
    expect(isBriefContentComplete({ ...toClientBriefView(row), talking_points: [], suggested_questions: [] })).toBe(false);
    expect(isBriefContentComplete({ ...toClientBriefView(row), why_interested: "  " })).toBe(false);
  });
});

describe("lifecycle", () => {
  it("advances Booked → Prepared → Sent → Viewed → Completed → Feedback", () => {
    const upcoming = appt("a", "2026-10-05", "09:00");
    const done = (steps: ReturnType<typeof buildLifecycle>) => steps.filter((s) => s.done).map((s) => s.label);
    expect(done(buildLifecycle(upcoming, null, null, NOW))).toEqual(["Booked"]);
    expect(done(buildLifecycle(upcoming, "brief_ready", null, NOW))).toEqual(["Booked", "Brief Prepared"]);
    expect(done(buildLifecycle(upcoming, "sent_to_client", null, NOW))).toEqual(["Booked", "Brief Prepared", "Brief Sent"]);
    expect(done(buildLifecycle(appt("a", "2026-09-30", "09:00"), "client_viewed", { x: 1 }, NOW))).toEqual([
      "Booked",
      "Brief Prepared",
      "Brief Sent",
      "Client Viewed",
      "Completed",
      "Feedback",
    ]);
  });
});

describe("computeFeedbackMetrics", () => {
  it("counts only recorded feedback for countable appointments", () => {
    const appointments = [appt("1", "2026-09-01", "09:00", "Completed"), appt("2", "2026-09-02", "09:00", "Completed"), appt("3", "2026-09-03", "09:00", "Cancelled"), appt("4", "2026-09-04", "09:00", "Booked")];
    const metrics = computeFeedbackMetrics(appointments, [
      feedback({ appointment_id: "1", outcome: "Won / Became Customer", opportunity_quality: "Strong" }),
      feedback({ appointment_id: "2", outcome: "Not Qualified", opportunity_quality: "Poor" }),
      feedback({ appointment_id: "3", outcome: "No Show" }), // cancelled: ignored
      feedback({ appointment_id: "other-client", outcome: "No Show" }), // not in this appointment set: ignored
    ]);
    expect(metrics).toMatchObject({ appointmentsCompleted: 2, feedbackReceived: 2, strongOrGood: 1, customersWon: 1, notQualified: 1, noShows: 0, followUpsRequired: 0 });
  });
});

describe("computeQualityInsights", () => {
  it("tallies recorded reasons, strong industries/locations and derives informational preferences", () => {
    const rows = [
      feedback({ appointment_id: "1", outcome: "Not Qualified", opportunity_quality: "Poor", fit_issues: ["Wrong decision maker", "Budget issue"], future_notes: "Prefer owners" }),
      feedback({ appointment_id: "2", outcome: "Not Ready Yet", opportunity_quality: "Fair", fit_issues: ["Wrong decision maker"] }),
      feedback({ appointment_id: "3", outcome: "Great Opportunity", opportunity_quality: "Strong" }),
      feedback({ appointment_id: "4", outcome: "Follow-Up Required", opportunity_quality: "Good" }),
    ];
    const insights = computeQualityInsights(rows, {
      "3": { industry: "Painters", location: "Ottawa, ON" },
      "4": { industry: "Painters", location: "Toronto, ON" },
    });
    expect(insights.feedbackCount).toBe(4);
    expect(insights.topFitIssues[0]).toEqual({ label: "Wrong decision maker", count: 2 });
    expect(insights.nonProgressReasons[0]).toEqual({ label: "Wrong decision maker", count: 2 });
    expect(insights.strongIndustries).toEqual([{ label: "Painters", count: 2 }]);
    expect(insights.strongLocations).toHaveLength(2);
    expect(insights.recentClientNotes).toEqual([{ appointmentId: "1", note: "Prefer owners", submittedAt: "2026-09-30T12:00:00Z" }]);
    expect(insights.preferences[0]).toEqual({ label: "Prioritize decision makers", count: 2 });
  });
  it("returns empty tallies when nothing is recorded (nothing invented)", () => {
    const insights = computeQualityInsights([], {});
    expect(insights).toMatchObject({ feedbackCount: 0, topFitIssues: [], preferences: [], strongIndustries: [] });
  });
});

describe("emails and links", () => {
  it("brief email carries date/time, business, summary and a CTA, and no contact details", () => {
    const body = buildBriefEmailBody({
      clientName: "Acme",
      businessName: "Joe's Auto",
      appointmentDate: "2026-10-05",
      appointmentTime: "09:00",
      timezone: "America/Toronto",
      primaryOpportunity: "Website redesign",
      whyInterested: "Wants more inquiries",
      recommendedNextStep: "Send Proposal",
      portalUrl: "https://leads.winsalotcorp.com/client/appointments/abc",
    });
    expect(body).toContain("Joe's Auto");
    expect(body).toContain("2026-10-05");
    expect(body).toContain("09:00 (America/Toronto)");
    expect(body).toContain("View Appointment Brief");
    expect(body).toContain("https://leads.winsalotcorp.com/client/appointments/abc");
  });
  it("only accepts appointment-brief deep links as post-login destinations", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(safeClientNextPath(`/client/appointments/${id}`)).toBe(`/client/appointments/${id}`);
    expect(safeClientNextPath("https://evil.example/client/appointments/" + id)).toBeNull();
    expect(safeClientNextPath("//evil.example")).toBeNull();
    expect(safeClientNextPath("/leadgen/admin")).toBeNull();
    expect(safeClientNextPath(undefined)).toBeNull();
  });
});
