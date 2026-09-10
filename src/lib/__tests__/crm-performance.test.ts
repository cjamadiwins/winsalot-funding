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
    proposalSentAt: null,
    applicationSubmittedAt: null,
    closedAt: null,
    ...overrides,
  };
}

describe("Growth CRM performance accuracy", () => {
  it("does not award consultation credit when an opportunity is merely added", () => {
    const result = computeCrmPeriodPerformance([opportunity()], "agent-1", "2026-09-07", "2026-09-20");

    expect(result.consultationsBooked).toBe(0);
    expect(result.consultationsPercentage).toBe(0);
    expect(result.overallPercentage).toBe(0);
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
    expect(result.overallPercentage).toBe(5);
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
