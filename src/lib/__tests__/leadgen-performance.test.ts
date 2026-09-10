import { describe, expect, it } from "vitest";
import {
  computeLeadgenAgentPerformance,
  computeLeadgenWeekBookedCount,
  leadgenCreditedAppointments,
  leadgenMondayOf,
  leadgenPerformanceTier,
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  type LeadgenPerformanceAppointment,
} from "../leadgen-performance";

// A known Monday-Friday work week: Sep 7, 2026 (Monday) through Sep 11,
// 2026 (Friday). Sep 12/13 are the following Saturday/Sunday.
const WEEK_START = "2026-09-07";
const WEEK_END = "2026-09-11";

function appointment(overrides: Partial<LeadgenPerformanceAppointment> = {}): LeadgenPerformanceAppointment {
  return {
    id: "appointment-1",
    business_name: "Example Business",
    contact_name: "Jane Doe",
    appointment_date: "2026-09-20",
    appointment_time: "10:00:00",
    status: "Booked",
    created_at: "2026-09-09T14:00:00.000Z", // Wednesday of the target week
    booking_agent_id: "agent-1",
    ...overrides,
  };
}

describe("Lead Generation CRM weekly performance accuracy", () => {
  it("targets exactly 4 appointments per week", () => {
    expect(LEADGEN_WEEKLY_APPOINTMENT_TARGET).toBe(4);
  });

  it("counts a genuine booked appointment created within the Monday-Friday week", () => {
    const now = new Date("2026-09-10T18:00:00.000Z"); // Thursday inside the week
    const result = computeLeadgenAgentPerformance([appointment()], "agent-1", now);

    expect(result.weekStart).toBe(WEEK_START);
    expect(result.weekEnd).toBe(WEEK_END);
    expect(result.bookedThisWeek).toBe(1);
    expect(result.percentage).toBe(25); // 1/4
  });

  it("excludes weekend bookings from the Monday-Friday window", () => {
    const now = new Date("2026-09-10T18:00:00.000Z");
    const saturdayAppt = appointment({ id: "sat", created_at: "2026-09-12T14:00:00.000Z" });
    const sundayAppt = appointment({ id: "sun", created_at: "2026-09-13T14:00:00.000Z" });
    const result = computeLeadgenAgentPerformance([saturdayAppt, sundayAppt], "agent-1", now);

    expect(result.bookedThisWeek).toBe(0);
  });

  it("does not count a cancelled appointment", () => {
    const now = new Date("2026-09-10T18:00:00.000Z");
    const result = computeLeadgenAgentPerformance([appointment({ status: "Cancelled" })], "agent-1", now);

    expect(result.bookedThisWeek).toBe(0);
  });

  it("does not count a replaced (corrected duplicate) appointment", () => {
    const now = new Date("2026-09-10T18:00:00.000Z");
    const result = computeLeadgenAgentPerformance([appointment({ status: "Replaced" })], "agent-1", now);

    expect(result.bookedThisWeek).toBe(0);
  });

  it("credits an appointment only to the agent who booked it", () => {
    const now = new Date("2026-09-10T18:00:00.000Z");
    const record = appointment({ booking_agent_id: "agent-2" });

    expect(computeLeadgenAgentPerformance([record], "agent-1", now).bookedThisWeek).toBe(0);
    expect(computeLeadgenAgentPerformance([record], "agent-2", now).bookedThisWeek).toBe(1);
  });

  it("does not include opportunity leads, emails, or any other activity - only appointments feed this score", () => {
    // computeLeadgenAgentPerformance's only input is appointment rows;
    // there is no code path here that reads leads, emails, or call logs.
    const now = new Date("2026-09-10T18:00:00.000Z");
    const result = computeLeadgenAgentPerformance([], "agent-1", now);

    expect(result.bookedThisWeek).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it("caps the gauge percentage at 100% once the target is met or exceeded, while the actual count stays uncapped", () => {
    const now = new Date("2026-09-10T18:00:00.000Z");
    const records = Array.from({ length: 6 }, (_, index) =>
      appointment({ id: `appt-${index}`, created_at: "2026-09-09T14:00:00.000Z" })
    );
    const result = computeLeadgenAgentPerformance(records, "agent-1", now);

    expect(result.bookedThisWeek).toBe(6); // real count, never clamped
    expect(result.percentage).toBe(100); // gauge score capped at 100
  });

  it("scores partial achievement proportionally, uncapped below 100%", () => {
    const now = new Date("2026-09-10T18:00:00.000Z");
    const records = [appointment({ id: "a" }), appointment({ id: "b" })]; // 2 of 4
    const result = computeLeadgenAgentPerformance(records, "agent-1", now);

    expect(result.bookedThisWeek).toBe(2);
    expect(result.percentage).toBe(50);
  });

  it("resolves a Saturday/Sunday 'now' to the Monday of the week already in progress, not the next one", () => {
    expect(leadgenMondayOf("2026-09-12")).toBe(WEEK_START); // Saturday
    expect(leadgenMondayOf("2026-09-13")).toBe(WEEK_START); // Sunday
  });

  it("rolls forward to a new period automatically at the next Monday", () => {
    const now = new Date("2026-09-14T12:00:00.000Z"); // the following Monday
    const result = computeLeadgenAgentPerformance([], "agent-1", now);

    expect(result.weekStart).toBe("2026-09-14");
    expect(result.weekEnd).toBe("2026-09-18");
  });

  it("builds a 5-day (Monday-Friday) daily breakdown, not 7", () => {
    const now = new Date("2026-09-10T18:00:00.000Z");
    const result = computeLeadgenAgentPerformance([], "agent-1", now);

    expect(result.dailyBreakdown).toHaveLength(5);
    expect(result.dailyBreakdown[0].date).toBe(WEEK_START);
    expect(result.dailyBreakdown[4].date).toBe(WEEK_END);
  });
});

describe("computeLeadgenWeekBookedCount matches the totals a caller would see against the underlying records", () => {
  it("counts only credited, in-range appointments for an arbitrary Monday-Friday week", () => {
    const records = [
      appointment({ id: "in-range", created_at: "2026-09-09T14:00:00.000Z" }),
      appointment({ id: "cancelled", status: "Cancelled", created_at: "2026-09-09T14:00:00.000Z" }),
      appointment({ id: "other-agent", booking_agent_id: "agent-2", created_at: "2026-09-09T14:00:00.000Z" }),
      appointment({ id: "next-week", created_at: "2026-09-15T14:00:00.000Z" }),
    ];

    expect(computeLeadgenWeekBookedCount(records, "agent-1", WEEK_START, WEEK_END)).toBe(1);
  });

  it("leadgenCreditedAppointments matches the exact rows counted, for auditing the displayed total", () => {
    const records = [
      appointment({ id: "counts", created_at: "2026-09-09T14:00:00.000Z" }),
      appointment({ id: "cancelled", status: "Cancelled" }),
    ];
    const credited = leadgenCreditedAppointments(records, "agent-1");

    expect(credited.map((r) => r.id)).toEqual(["counts"]);
  });
});

describe("leadgenPerformanceTier gauge bands", () => {
  it("classifies 0-39 as red (Behind Target)", () => {
    expect(leadgenPerformanceTier(0)).toBe("red");
    expect(leadgenPerformanceTier(39)).toBe("red");
  });

  it("classifies 40-69 as yellow (Needs Improvement)", () => {
    expect(leadgenPerformanceTier(40)).toBe("yellow");
    expect(leadgenPerformanceTier(69)).toBe("yellow");
  });

  it("classifies 70-100 as green (On Track)", () => {
    expect(leadgenPerformanceTier(70)).toBe("green");
    expect(leadgenPerformanceTier(100)).toBe("green");
  });
});
