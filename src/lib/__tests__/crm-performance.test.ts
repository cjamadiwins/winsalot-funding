import { describe, expect, it } from "vitest";
import { computeCrmPeriodPerformance, crmPerformanceTier, type CrmPerformanceOpportunityRecord } from "../crm-performance";

function opportunity(overrides: Partial<CrmPerformanceOpportunityRecord> = {}): CrmPerformanceOpportunityRecord {
  return {
    opportunityId: "opportunity-1",
    assignedAgentId: "agent-1",
    businessName: "Example Business",
    opportunityType: "lead_generation",
    stage: "New Prospect",
    createdAt: "2026-09-10T14:00:00.000Z",
    consultationBookings: [],
    deliveredEmails: [],
    applicationSubmittedAt: null,
    applicationSubmittedByAgentId: null,
    closedAt: null,
    ...overrides,
  };
}

describe("Growth CRM performance accuracy", () => {
  it("does not award consultation credit when an opportunity is merely added", () => {
    const result = computeCrmPeriodPerformance([opportunity()], "agent-1", "2026-09-07", "2026-09-20");

    expect(result.consultationsBooked).toBe(0);
    expect(result.consultationsPercentage).toBe(0);
    expect(result.qualifiedOpportunities).toBe(1);
    expect(result.overallPercentage).toBe(3);
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
      "2026-09-07",
      "2026-09-20"
    );

    expect(result.consultationsBooked).toBe(1);
    expect(result.consultationsPercentage).toBe(25);
    expect(result.overallPercentage).toBe(8);
  });

  it("counts every newly added opportunity without requiring a later stage", () => {
    const result = computeCrmPeriodPerformance([opportunity()], "agent-1", "2026-09-07", "2026-09-20");

    expect(result.qualifiedOpportunities).toBe(1);
    expect(result.qualifiedPercentage).toBe(17);
  });

  it("awards the email milestone only after the first manual email is confirmed delivered", () => {
    const record = opportunity({
      assignedAgentId: "agent-2",
      deliveredEmails: [
        { emailId: "email-1", agentId: "agent-1", deliveredAt: "2026-09-10T16:00:00.000Z" },
        { emailId: "email-2", agentId: "agent-2", deliveredAt: "2026-09-11T16:00:00.000Z" },
      ],
    });

    expect(computeCrmPeriodPerformance([record], "agent-1", "2026-09-07", "2026-09-20").proposalsSent).toBe(1);
    expect(computeCrmPeriodPerformance([record], "agent-2", "2026-09-07", "2026-09-20").proposalsSent).toBe(0);
  });

  it("does not award application credit from a stage change alone", () => {
    const result = computeCrmPeriodPerformance(
      [opportunity({ opportunityType: "business_financing", stage: "Proposal or Application Sent" })],
      "agent-1",
      "2026-09-07",
      "2026-09-20"
    );

    expect(result.applicationsSubmitted).toBe(0);
    expect(result.proposalsSent).toBe(0);
  });

  it("awards application credit only to the recorded submitting agent for financing opportunities", () => {
    const record = opportunity({
      opportunityType: "business_financing",
      applicationSubmittedAt: "2026-09-12T16:00:00.000Z",
      applicationSubmittedByAgentId: "agent-1",
    });

    expect(computeCrmPeriodPerformance([record], "agent-1", "2026-09-07", "2026-09-20").applicationsSubmitted).toBe(1);
    expect(computeCrmPeriodPerformance([record], "agent-2", "2026-09-07", "2026-09-20").applicationsSubmitted).toBe(0);
  });

  it("keeps appointment credit with the agent assigned at booking time", () => {
    const record = opportunity({
      assignedAgentId: "agent-2",
      consultationBookings: [
        { appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-10T15:00:00.000Z" },
      ],
    });

    expect(computeCrmPeriodPerformance([record], "agent-1", "2026-09-07", "2026-09-20").consultationsBooked).toBe(1);
    expect(computeCrmPeriodPerformance([record], "agent-2", "2026-09-07", "2026-09-20").consultationsBooked).toBe(0);
  });

  it("returns every metric at zero with no activity in the period", () => {
    const result = computeCrmPeriodPerformance([], "agent-1", "2026-09-07", "2026-09-20");

    expect(result.consultationsBooked).toBe(0);
    expect(result.qualifiedOpportunities).toBe(0);
    expect(result.applicationsSubmitted).toBe(0);
    expect(result.proposalsSent).toBe(0);
    expect(result.clientsWon).toBe(0);
    expect(result.overallPercentage).toBe(0);
  });

  it("scores partial achievement of a target proportionally, uncapped below 100%", () => {
    const records = [opportunity(), opportunity(), opportunity()]; // 3 of 6 target opportunities
    const result = computeCrmPeriodPerformance(records, "agent-1", "2026-09-07", "2026-09-20");

    expect(result.qualifiedOpportunities).toBe(3);
    expect(result.qualifiedPercentage).toBe(50);
  });

  it("caps a category's percentage at 100% once its target is met or exceeded", () => {
    // 8 opportunities added against a target of 6 must still read as 100%,
    // never 133% - overallPercentage's average must never exceed 100
    // because one category blew past its target.
    const records = Array.from({ length: 8 }, () => opportunity());
    const result = computeCrmPeriodPerformance(records, "agent-1", "2026-09-07", "2026-09-20");

    expect(result.qualifiedOpportunities).toBe(8);
    expect(result.qualifiedPercentage).toBe(100);
  });

  it("weights every one of the five categories equally at 20%, matching the sum of capped percentages divided by five", () => {
    const record = opportunity({
      consultationBookings: [{ appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-10T15:00:00.000Z" }],
      deliveredEmails: [{ emailId: "email-1", agentId: "agent-1", deliveredAt: "2026-09-10T16:00:00.000Z" }],
      opportunityType: "business_financing",
      applicationSubmittedAt: "2026-09-12T16:00:00.000Z",
      applicationSubmittedByAgentId: "agent-1",
      stage: "Client Won",
      closedAt: "2026-09-13T16:00:00.000Z",
    });
    const result = computeCrmPeriodPerformance([record], "agent-1", "2026-09-07", "2026-09-20");

    // 1 opportunity/6 = 17%, 1 consultation/4 = 25%, 1 email/4 = 25%,
    // 1 application/2 = 50%, 1 client won/2 = 50%.
    expect(result.qualifiedPercentage).toBe(17);
    expect(result.consultationsPercentage).toBe(25);
    expect(result.proposalsPercentage).toBe(25);
    expect(result.applicationsPercentage).toBe(50);
    expect(result.wonPercentage).toBe(50);
    const expectedOverall = Math.round((17 + 25 + 25 + 50 + 50) / 5);
    expect(result.overallPercentage).toBe(expectedOverall);
  });

  it("never counts a bounced or otherwise undelivered email - only a confirmed delivery reaches deliveredEmails", () => {
    // The data layer (crm-performance-data.ts) only ever populates
    // deliveredEmails from crm_lead_emails rows with a non-null
    // delivered_at, so a bounced/failed/sent-only email never appears
    // here at all - an opportunity with no confirmed delivery must score
    // zero regardless of how many emails were attempted.
    const result = computeCrmPeriodPerformance([opportunity({ deliveredEmails: [] })], "agent-1", "2026-09-07", "2026-09-20");

    expect(result.proposalsSent).toBe(0);
  });

  it("moves consultation credit to whichever agent the opportunity is reassigned to only for bookings made after the reassignment", () => {
    const record = opportunity({
      assignedAgentId: "agent-2", // reassigned after agent-1's original booking
      consultationBookings: [
        { appointmentId: "appointment-1", assignedAgentId: "agent-1", bookedAt: "2026-09-10T15:00:00.000Z" },
        { appointmentId: "appointment-2", assignedAgentId: "agent-2", bookedAt: "2026-09-15T15:00:00.000Z" },
      ],
    });
    const forAgent1 = computeCrmPeriodPerformance([record], "agent-1", "2026-09-07", "2026-09-20");
    const forAgent2 = computeCrmPeriodPerformance([record], "agent-2", "2026-09-07", "2026-09-20");

    expect(forAgent1.consultationsBooked).toBe(1);
    expect(forAgent2.consultationsBooked).toBe(1);
    // Opportunities Added always credits whoever is currently assigned,
    // regardless of who it was assigned to when created.
    expect(forAgent1.qualifiedOpportunities).toBe(0);
    expect(forAgent2.qualifiedOpportunities).toBe(1);
  });

  it("confirms adding an opportunity by itself increases only Opportunities Added", () => {
    const result = computeCrmPeriodPerformance([opportunity()], "agent-1", "2026-09-07", "2026-09-20");

    expect(result.qualifiedOpportunities).toBe(1);
    expect(result.consultationsBooked).toBe(0);
    expect(result.proposalsSent).toBe(0);
    expect(result.applicationsSubmitted).toBe(0);
    expect(result.clientsWon).toBe(0);
  });

  it("does not award any metric from a stage-only change with no other recorded event", () => {
    const result = computeCrmPeriodPerformance(
      [opportunity({ opportunityType: "both_services", stage: "Interested" })],
      "agent-1",
      "2026-09-07",
      "2026-09-20"
    );

    expect(result.consultationsBooked).toBe(0);
    expect(result.proposalsSent).toBe(0);
    expect(result.applicationsSubmitted).toBe(0);
    expect(result.clientsWon).toBe(0);
    // Only the creation event counts, unaffected by the current stage.
    expect(result.qualifiedOpportunities).toBe(1);
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
