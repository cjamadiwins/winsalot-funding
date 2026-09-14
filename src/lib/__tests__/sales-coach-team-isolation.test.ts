import { describe, expect, it, vi } from "vitest";

// Confirms the admin Team Overview's per-agent breakdown (Winsalot Sales
// Coach & Operations Manager) never leaks one agent's opportunities,
// follow-ups, or call logs into another agent's summary, even though the
// underlying queries fetch every agent's rows in one service-role call
// (the same pattern loadAdminOpportunityFinderData/getCrmPerformanceRecords
// already use). The per-agent counters in growth-sales-coach.ts/
// leadgen-sales-coach.ts are the one place a bug here could actually leak
// data between agents, since the fetch itself is intentionally unscoped.
//
// The agent-facing loaders (loadGrowthAgentSalesCoachData/
// loadLeadgenAgentSalesCoachData) apply no agent_id filter of their own by
// design - they rely entirely on RLS (crm_opportunity_scores_agent_select_
// own / leadgen_opportunity_scores_agent_select_own) to scope the session
// client's query, exactly like every other agent-dashboard read in this
// codebase (see agent-my-opportunities-data.ts). That RLS boundary is
// covered by this repo's existing database-level tests/verification, not
// re-tested here.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/winsalot-consultation-reminders", () => ({
  fetchWinsalotReminderStatusMap: async () => ({}),
}));
vi.mock("@/lib/leadgen-appointment-reminders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/leadgen-appointment-reminders")>("@/lib/leadgen-appointment-reminders");
  return { ...actual, fetchLeadgenAppointmentReminderStatusMap: async () => ({}) };
});

// A minimal, thenable query-builder stub: every chained call (.select/.eq/
// .in/.gte/.order) just returns itself, and awaiting it resolves to
// `{ data: rows }` - enough for the straight-line "select ... from one
// table" queries this module issues, without a full PostgREST fake.
function fakeSupabase(tables: Record<string, unknown[]>) {
  function chain(rows: unknown[]) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      order: () => builder,
      then: (resolve: (value: { data: unknown[] }) => void) => resolve({ data: rows }),
    };
    return builder;
  }
  return {
    from: (table: string) => chain(tables[table] ?? []),
  } as never;
}

describe("Growth CRM Sales Coach Team Overview - per-agent isolation", () => {
  it("never attributes one agent's Hot/Warm/overdue counts to another agent", async () => {
    const { loadGrowthTeamSalesCoachData } = await import("@/lib/growth-sales-coach");

    const now = new Date("2026-09-08T13:00:00.000Z"); // Tuesday, 09:00 Toronto
    const overdueAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const supabase = fakeSupabase({
      crm_opportunity_scores: [
        {
          score: 90,
          category: "hot",
          priority_override: null,
          finder_state: "active",
          crm_opportunities: {
            id: "opp-henry-1",
            business_name: "Henry's Hot Lead",
            assigned_agent_id: "henry",
            last_contacted_at: now.toISOString(),
            stage: "Interested",
            next_follow_up_at: overdueAt,
          },
        },
        {
          score: 65,
          category: "warm",
          priority_override: null,
          finder_state: "active",
          crm_opportunities: {
            id: "opp-goodness-1",
            business_name: "Goodness' Warm Lead",
            assigned_agent_id: "goodness",
            last_contacted_at: now.toISOString(),
            stage: "Interested",
            next_follow_up_at: null,
          },
        },
      ],
      crm_call_logs: [{ agent_id: "henry", created_at: now.toISOString(), outcome: "Interested" }],
    });

    const result = await loadGrowthTeamSalesCoachData({
      admin: supabase,
      activeAgents: [
        { id: "henry", full_name: "Henry", email: "henry@example.com", role: "agent", active: true, scheduled_start_time: null } as never,
        { id: "goodness", full_name: "Goodness", email: "goodness@example.com", role: "agent", active: true, scheduled_start_time: null } as never,
      ],
      now,
      consultations: [],
      performanceRecords: [],
      clockedInAgentIds: ["henry"],
    });

    const henry = result.agents.find((a) => a.agentId === "henry")!;
    const goodness = result.agents.find((a) => a.agentId === "goodness")!;

    expect(henry.hotCount).toBe(1);
    expect(henry.warmCount).toBe(0);
    expect(henry.followUpsOverdueCount).toBe(1);
    expect(henry.callLog.countToday).toBe(1);
    expect(henry.presence.isClockedIn).toBe(true);

    expect(goodness.hotCount).toBe(0);
    expect(goodness.warmCount).toBe(1);
    expect(goodness.followUpsOverdueCount).toBe(0);
    expect(goodness.callLog.countToday).toBe(0);
    expect(goodness.presence.isClockedIn).toBe(false);

    // Team totals are the sum of each agent's own count, never double-
    // counted or cross-attributed.
    expect(result.teamHot).toBe(1);
    expect(result.teamWarm).toBe(1);
    expect(result.teamFollowUpsOverdue).toBe(1);
  });
});

describe("Lead Generation CRM Sales Coach Team Overview - per-agent isolation", () => {
  it("never attributes one agent's Hot/Warm/overdue counts to another agent", async () => {
    const { loadLeadgenTeamSalesCoachData } = await import("@/lib/leadgen-sales-coach");

    const now = new Date("2026-09-08T13:00:00.000Z");
    const overdueAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const supabase = fakeSupabase({
      leadgen_opportunity_scores: [
        {
          score: 90,
          category: "hot",
          priority_override: null,
          finder_state: "active",
          leadgen_leads: {
            id: "lead-henry-1",
            business_name: "Henry's Hot Lead",
            assigned_agent_id: "henry",
            last_contacted_at: now.toISOString(),
            status: "Interested",
            next_follow_up_at: overdueAt,
          },
        },
        {
          score: 65,
          category: "warm",
          priority_override: null,
          finder_state: "active",
          leadgen_leads: {
            id: "lead-goodness-1",
            business_name: "Goodness' Warm Lead",
            assigned_agent_id: "goodness",
            last_contacted_at: now.toISOString(),
            status: "Interested",
            next_follow_up_at: null,
          },
        },
      ],
      leadgen_call_logs: [{ agent_id: "henry", created_at: now.toISOString(), outcome: "Interested" }],
    });

    const result = await loadLeadgenTeamSalesCoachData({
      admin: supabase,
      activeAgents: [
        { id: "henry", full_name: "Henry", scheduled_start_time: null },
        { id: "goodness", full_name: "Goodness", scheduled_start_time: null },
      ],
      now,
      appointments: [],
      clockedInAgentIds: ["henry"],
    });

    const henry = result.agents.find((a) => a.agentId === "henry")!;
    const goodness = result.agents.find((a) => a.agentId === "goodness")!;

    expect(henry.hotCount).toBe(1);
    expect(henry.warmCount).toBe(0);
    expect(henry.followUpsOverdueCount).toBe(1);
    expect(henry.callLog.countToday).toBe(1);
    expect(henry.presence.isClockedIn).toBe(true);

    expect(goodness.hotCount).toBe(0);
    expect(goodness.warmCount).toBe(1);
    expect(goodness.followUpsOverdueCount).toBe(0);
    expect(goodness.callLog.countToday).toBe(0);
    expect(goodness.presence.isClockedIn).toBe(false);
  });
});
