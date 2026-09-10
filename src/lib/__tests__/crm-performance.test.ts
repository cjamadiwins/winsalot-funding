import { describe, expect, it } from "vitest";
import { computeCrmPeriodPerformance, type CrmPerformanceOpportunityRecord } from "../crm-performance";

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
});
