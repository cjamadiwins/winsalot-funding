import { describe, expect, it } from "vitest";
import {
  computeCrmPeriodPerformance,
  computeCrmAgentPerformance,
  crmPerformanceTier,
  crmWeekStartOf,
  CRM_WEEKLY_CONSULTATIONS_TARGET,
  CRM_WEEKLY_LEADS_ADDED_TARGET,
  CRM_WEEKLY_EMAILS_DELIVERED_TARGET,
  type CrmPerformanceOpportunityRecord,
} from "../crm-performance";

// A known Monday-Friday work week: Sep 7, 2026 (Monday) through Sep 11,
// 2026 (Friday). Sep 12/13 are the following Saturday/Sunday.
const WEEK_START = "2026-09-07";
const WEEK_END = "2026-09-11";

function opportunity(overrides: Partial<CrmPerformanceOpportunityRecord> = {}): CrmPerformanceOpportunityRecord {
  return {
    opportunityId: "opportunity-1",
    assignedAgentId: "agent-1",
    businessName: "Example Business",
    createdAt: "2026-09-10T14:00:00.000Z",
    consultationBookings: [],
    deliveredEmails: [],
    ...overrides,
  };
}

describe("Growth CRM weekly performance accuracy", () => {
  it("does not award consultation credit when an opportunity is merely added", () => {
    const result = computeCrmPeriodPerformance([opportunity()], "agent-1", WEEK_START, WEEK_END);

    expect(result.consultationsBooked).toBe(0);
    expect(result.consultationsPercentage).toBe(0);
    expect(result.leadsAdded).toBe(1);
  });

  it("awards consultation credit only from a real booked appointment", () => {
    const result = computeCrmPeriodPerformance(
      [
        opportunity({
          consultationBookings: [
            { appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-10T15:00:00.000Z" },
          ],
        }),
      ],
      "agent-1",
      WEEK_START,
      WEEK_END
    );

    expect(result.consultationsBooked).toBe(1);
    expect(result.consultationsPercentage).toBe(25); // 1/4
  });

  it("counts every newly added opportunity without requiring a later stage", () => {
    const result = computeCrmPeriodPerformance([opportunity()], "agent-1", WEEK_START, WEEK_END);

    expect(result.leadsAdded).toBe(1);
    expect(result.leadsAddedPercentage).toBe(8); // round(1/12 * 100)
  });

  it("counts every confirmed-delivered email, not only the first, for the crediting agent", () => {
    const record = opportunity({
      assignedAgentId: "agent-2",
      deliveredEmails: [
        { emailId: "email-1", agentId: "agent-1", deliveredAt: "2026-09-08T16:00:00.000Z" },
        { emailId: "email-2", agentId: "agent-1", deliveredAt: "2026-09-10T16:00:00.000Z" },
        { emailId: "email-3", agentId: "agent-2", deliveredAt: "2026-09-11T16:00:00.000Z" },
      ],
    });

    expect(computeCrmPeriodPerformance([record], "agent-1", WEEK_START, WEEK_END).emailsDelivered).toBe(2);
    expect(computeCrmPeriodPerformance([record], "agent-2", WEEK_START, WEEK_END).emailsDelivered).toBe(1);
  });

  it("keeps appointment credit with the agent assigned at booking time", () => {
    const record = opportunity({
      assignedAgentId: "agent-2",
      consultationBookings: [
        { appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-10T15:00:00.000Z" },
      ],
    });

    expect(computeCrmPeriodPerformance([record], "agent-1", WEEK_START, WEEK_END).consultationsBooked).toBe(1);
    expect(computeCrmPeriodPerformance([record], "agent-2", WEEK_START, WEEK_END).consultationsBooked).toBe(0);
  });

  it("returns every metric at zero with no activity in the period", () => {
    const result = computeCrmPeriodPerformance([], "agent-1", WEEK_START, WEEK_END);

    expect(result.consultationsBooked).toBe(0);
    expect(result.leadsAdded).toBe(0);
    expect(result.emailsDelivered).toBe(0);
    expect(result.overallPercentage).toBe(0);
  });

  it("scores partial achievement of a target proportionally, uncapped below 100%", () => {
    const records = [
      opportunity({ opportunityId: "o1" }),
      opportunity({ opportunityId: "o2" }),
      opportunity({ opportunityId: "o3" }),
    ]; // 3 of 12 target leads added
    const result = computeCrmPeriodPerformance(records, "agent-1", WEEK_START, WEEK_END);

    expect(result.leadsAdded).toBe(3);
    expect(result.leadsAddedPercentage).toBe(25);
  });

  it("caps a category's percentage at 100% once its target is met or exceeded, while the actual count stays uncapped", () => {
    // 15 leads added against a target of 12 must still show 100% progress,
    // but the actual count must still read 15, not clamp to 12.
    const records = Array.from({ length: 15 }, (_, index) => opportunity({ opportunityId: `o${index}` }));
    const result = computeCrmPeriodPerformance(records, "agent-1", WEEK_START, WEEK_END);

    expect(result.leadsAdded).toBe(15);
    expect(result.leadsAddedPercentage).toBe(100);
  });

  it("weights every one of the three categories equally, matching the average of their capped percentages", () => {
    const record = opportunity({
      consultationBookings: [{ appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-10T15:00:00.000Z" }],
      deliveredEmails: [{ emailId: "email-1", agentId: "agent-1", deliveredAt: "2026-09-10T16:00:00.000Z" }],
    });
    const result = computeCrmPeriodPerformance([record], "agent-1", WEEK_START, WEEK_END);

    // 1 opportunity/12 = 8%, 1 consultation/4 = 25%, 1 email/12 = 8%.
    expect(result.leadsAddedPercentage).toBe(8);
    expect(result.consultationsPercentage).toBe(25);
    expect(result.emailsDeliveredPercentage).toBe(8);
    const expectedOverall = Math.round((8 + 25 + 8) / 3);
    expect(result.overallPercentage).toBe(expectedOverall);
  });

  it("never counts a bounced or otherwise undelivered email - only a confirmed delivery reaches deliveredEmails", () => {
    // The data layer (crm-performance-data.ts) only ever populates
    // deliveredEmails from crm_lead_emails rows with a non-null
    // delivered_at, so a bounced/failed/sent-only email never appears
    // here at all - an opportunity with no confirmed delivery must score
    // zero regardless of how many emails were attempted.
    const result = computeCrmPeriodPerformance([opportunity({ deliveredEmails: [] })], "agent-1", WEEK_START, WEEK_END);

    expect(result.emailsDelivered).toBe(0);
  });

  it("excludes weekend activity from the Monday-Friday window", () => {
    const record = opportunity({
      createdAt: "2026-09-12T14:00:00.000Z", // Saturday
      consultationBookings: [{ appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-13T15:00:00.000Z" }], // Sunday
      deliveredEmails: [{ emailId: "email-1", agentId: "agent-1", deliveredAt: "2026-09-12T16:00:00.000Z" }], // Saturday
    });
    const result = computeCrmPeriodPerformance([record], "agent-1", WEEK_START, WEEK_END);

    expect(result.leadsAdded).toBe(0);
    expect(result.consultationsBooked).toBe(0);
    expect(result.emailsDelivered).toBe(0);
  });

  it("moves consultation credit to whichever agent the opportunity is reassigned to only for bookings made after the reassignment", () => {
    const record = opportunity({
      assignedAgentId: "agent-2", // reassigned after agent-1's original booking
      consultationBookings: [
        { appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-08T15:00:00.000Z" },
        { appointmentId: "appointment-2", assignedAgentId: "agent-2", bookedAt: "2026-09-10T15:00:00.000Z" },
      ],
    });
    const forAgent1 = computeCrmPeriodPerformance([record], "agent-1", WEEK_START, WEEK_END);
    const forAgent2 = computeCrmPeriodPerformance([record], "agent-2", WEEK_START, WEEK_END);

    expect(forAgent1.consultationsBooked).toBe(1);
    expect(forAgent2.consultationsBooked).toBe(1);
    // Opportunity Leads Added always credits whoever is currently assigned,
    // regardless of who it was assigned to when created.
    expect(forAgent1.leadsAdded).toBe(0);
    expect(forAgent2.leadsAdded).toBe(1);
  });

  it("confirms adding an opportunity by itself increases only Opportunity Leads Added", () => {
    const result = computeCrmPeriodPerformance([opportunity()], "agent-1", WEEK_START, WEEK_END);

    expect(result.leadsAdded).toBe(1);
    expect(result.consultationsBooked).toBe(0);
    expect(result.emailsDelivered).toBe(0);
  });

  it("confirms booking a consultation by itself increases only Consultations Booked", () => {
    const record = opportunity({
      consultationBookings: [{ appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-10T15:00:00.000Z" }],
    });
    // Use a fresh opportunity created well outside the week so it can't
    // also register as a lead added in this same period.
    record.createdAt = "2026-01-01T00:00:00.000Z";
    const result = computeCrmPeriodPerformance([record], "agent-1", WEEK_START, WEEK_END);

    expect(result.consultationsBooked).toBe(1);
    expect(result.leadsAdded).toBe(0);
    expect(result.emailsDelivered).toBe(0);
  });

  it("confirms a delivered email by itself increases only Emails Delivered", () => {
    const record = opportunity({
      createdAt: "2026-01-01T00:00:00.000Z",
      deliveredEmails: [{ emailId: "email-1", agentId: "agent-1", deliveredAt: "2026-09-10T16:00:00.000Z" }],
    });
    const result = computeCrmPeriodPerformance([record], "agent-1", WEEK_START, WEEK_END);

    expect(result.emailsDelivered).toBe(1);
    expect(result.leadsAdded).toBe(0);
    expect(result.consultationsBooked).toBe(0);
  });
});

describe("crmWeekStartOf", () => {
  it("returns the Monday of the week for any weekday in that week", () => {
    expect(crmWeekStartOf("2026-09-07")).toBe("2026-09-07"); // Monday itself
    expect(crmWeekStartOf("2026-09-09")).toBe("2026-09-07"); // Wednesday
    expect(crmWeekStartOf("2026-09-11")).toBe("2026-09-07"); // Friday
  });

  it("resolves a Saturday/Sunday to the Monday of the week already in progress, not the next one", () => {
    expect(crmWeekStartOf("2026-09-12")).toBe("2026-09-07"); // Saturday
    expect(crmWeekStartOf("2026-09-13")).toBe("2026-09-07"); // Sunday
  });

  it("rolls forward to a new period automatically at the next Monday", () => {
    expect(crmWeekStartOf("2026-09-14")).toBe("2026-09-14"); // the following Monday
  });
});

describe("computeCrmAgentPerformance", () => {
  it("computes the current Monday-Friday period from `now` and returns prior weeks as history", () => {
    const now = new Date("2026-09-10T18:00:00.000Z"); // a Thursday inside the target week
    const result = computeCrmAgentPerformance([], "agent-1", now);

    expect(result.current.periodStart).toBe("2026-09-07");
    expect(result.current.periodEnd).toBe("2026-09-11");
    expect(result.history.length).toBeGreaterThan(0);
    expect(result.history[0].periodStart).toBe("2026-08-31"); // the prior Monday
  });

  it("targets match the required weekly values", () => {
    expect(CRM_WEEKLY_CONSULTATIONS_TARGET).toBe(4);
    expect(CRM_WEEKLY_LEADS_ADDED_TARGET).toBe(12);
    expect(CRM_WEEKLY_EMAILS_DELIVERED_TARGET).toBe(12);
  });
});

describe("crmPerformanceTier gauge bands", () => {
  it("classifies 0-39 as red (Needs Improvement)", () => {
    expect(crmPerformanceTier(0)).toBe("red");
    expect(crmPerformanceTier(39)).toBe("red");
  });

  it("classifies 40-59 as yellow (Fair)", () => {
    expect(crmPerformanceTier(40)).toBe("yellow");
    expect(crmPerformanceTier(59)).toBe("yellow");
  });

  it("classifies 60-79 as green (Good)", () => {
    expect(crmPerformanceTier(60)).toBe("green");
    expect(crmPerformanceTier(79)).toBe("green");
  });

  it("classifies 80-100 as blue (Excellent)", () => {
    expect(crmPerformanceTier(80)).toBe("blue");
    expect(crmPerformanceTier(100)).toBe("blue");
  });
});
