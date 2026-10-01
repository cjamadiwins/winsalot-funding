import { describe, expect, it } from "vitest";
import { computeGrowthReportActivity, computeLeadgenReportActivity } from "../agent-performance-report-kpis";
import { countWeekdaysInclusive, renderAgentPerformanceEmail } from "../agent-performance-report-email";

describe("agent performance report KPI data", () => {
  it("counts actual weekdays in a report range, including partial weeks and month boundaries", () => {
    expect(countWeekdaysInclusive("2026-09-28", "2026-10-02")).toBe(5);
    expect(countWeekdaysInclusive("2026-09-30", "2026-09-30")).toBe(1);
    expect(countWeekdaysInclusive("2026-10-03", "2026-10-04")).toBe(0);
  });

  it("counts Lead Generation activity only for the report's agent and date window", () => {
    const result = computeLeadgenReportActivity({
      agentId: "agent-a",
      start: "2026-09-28",
      end: "2026-10-02",
      calls: [
        { agent_id: "agent-a", created_at: "2026-09-28T13:00:00.000Z" },
        { agent_id: "agent-a", created_at: "2026-10-03T13:00:00.000Z" },
        { agent_id: "agent-b", created_at: "2026-09-29T13:00:00.000Z" },
      ],
      emails: [
        { agent_id: "agent-a", sent_at: "2026-09-28T13:00:00.000Z", delivered_at: "2026-09-28T13:01:00.000Z" },
        { agent_id: "agent-a", sent_at: "2026-09-29T13:00:00.000Z", delivered_at: null },
        { agent_id: "agent-b", sent_at: "2026-09-29T13:00:00.000Z", delivered_at: "2026-09-29T13:01:00.000Z" },
      ],
      followUps: [
        { agent_id: "agent-a", scheduled_at: "2026-09-30T14:00:00.000Z", status: "pending" },
        { agent_id: "agent-a", scheduled_at: "2026-09-30T14:00:00.000Z", status: "completed" },
        { agent_id: "agent-b", scheduled_at: "2026-09-30T14:00:00.000Z", status: "pending" },
      ],
      leads: [
        { assigned_agent_id: "agent-a", status: "Interested", created_at: "2026-09-30T14:00:00.000Z" },
        { assigned_agent_id: "agent-b", status: "Interested", created_at: "2026-09-30T14:00:00.000Z" },
        { assigned_agent_id: "agent-a", status: "New", created_at: "2026-09-30T14:00:00.000Z" },
      ],
    });

    expect(result).toEqual({ calls: 1, emailsSent: 2, emailsDelivered: 1, emailDeliveryRate: 50, followUpsDue: 1, interestedLeads: 1 });
  });

  it("scopes Growth email and follow-up activity through the current record owner", () => {
    const result = computeGrowthReportActivity({
      agentId: "agent-a",
      start: "2026-09-28",
      end: "2026-10-02",
      emails: [
        { agent_id: "agent-a", sent_at: "2026-09-28T13:00:00.000Z", delivered_at: "2026-09-28T13:01:00.000Z" },
        { agent_id: "agent-b", sent_at: "2026-09-28T13:00:00.000Z", delivered_at: null },
      ],
      followUps: [
        { lead_id: "lead-a", opportunity_id: null, scheduled_at: "2026-09-29T13:00:00.000Z", status: "pending" },
        { lead_id: null, opportunity_id: "opp-a", scheduled_at: "2026-09-29T13:00:00.000Z", status: "pending" },
        { lead_id: "lead-b", opportunity_id: null, scheduled_at: "2026-09-29T13:00:00.000Z", status: "pending" },
      ],
      leads: [{ id: "lead-a", assigned_agent_id: "agent-a" }, { id: "lead-b", assigned_agent_id: "agent-b" }],
      opportunityOwners: new Map([["opp-a", "agent-a"]]),
    });
    expect(result).toEqual({ emailsSent: 1, emailsDelivered: 1, emailDeliveryRate: 100, followUpsDue: 2 });
  });
});

describe("agent performance report email layout", () => {
  it("renders the same safe report design for both period titles and keeps data links", () => {
    const sections = [{
      title: "Lead Generation CRM" as const,
      overallPercentage: 72,
      status: "On Track",
      href: "https://leads.winsalotcorp.com/leadgen/agent/performance",
      metrics: [
        { label: "Calls completed", result: 400, goal: 400, rate: 100 },
        { label: "Email delivery rate", result: "95%", goal: null, rate: 95, informational: true },
      ],
    }];
    const weekly = renderAgentPerformanceEmail({ recipientName: "C.J. Amadi", periodTitle: "Weekly Agent Performance", periodLabel: "Sep 28 – Oct 2, 2026", sections });
    const monthly = renderAgentPerformanceEmail({ recipientName: "C.J. Amadi", periodTitle: "Monthly Agent Performance", periodLabel: "September 2026", monthly: true, sections });

    expect(weekly.html).toContain("Weekly Agent Performance");
    expect(monthly.html).toContain("Monthly Agent Performance");
    expect(monthly.html).toContain("/leadgen/agent/performance/monthly");
    expect(weekly.html).toContain("View full Lead Generation CRM report");
    expect(weekly.html).toContain("winsalot-logo.png");
    expect(weekly.html).toContain("Keep Going!");
    expect(weekly.html).not.toContain("display:grid");
    expect(weekly.text).toContain("Calls completed: 400 / 400 (100%)");
  });
});
