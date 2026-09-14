import { describe, expect, it } from "vitest";
import {
  buildAgentCoachRecommendation,
  buildAgentHeadline,
  buildAgentRecommendedActions,
  buildCallLogCoachingNote,
  buildCallLogReminder,
  buildTeamHeadline,
  buildTeamOperationsPriority,
  buildTeamRecommendedActions,
  computeTeamWeeklyTarget,
  isSalesCoachWorkingDay,
  isStaleContact,
  teamAgentMainPriority,
  teamAgentsAheadOfTarget,
  teamAgentsBehindTarget,
  zonedStartOfDayIso,
  type SalesCoachAgentData,
  type SalesCoachAppointmentRef,
  type SalesCoachFollowUpRef,
  type SalesCoachOpportunityRef,
  type SalesCoachTeamAgentSummary,
  type SalesCoachTeamData,
} from "../sales-coach";

// Sep 7, 2026 is a known Monday (America/Toronto, EDT = UTC-4), same
// reference week used by crm-performance.test.ts / leadgen-performance's
// own tests. 13:00Z = 09:00 Toronto, 16:00Z = 12:00 Toronto.
const MONDAY_MORNING = new Date("2026-09-07T13:00:00.000Z");
const MONDAY_AFTERNOON = new Date("2026-09-07T16:00:00.000Z");
const SATURDAY = new Date("2026-09-12T16:00:00.000Z");

function opportunity(overrides: Partial<SalesCoachOpportunityRef> = {}): SalesCoachOpportunityRef {
  return { id: "opp-1", businessName: "ABC Web Design", href: "/agent/opportunities/opp-1", score: 85, lastContactedAt: null, ...overrides };
}

function followUp(overrides: Partial<SalesCoachFollowUpRef> = {}): SalesCoachFollowUpRef {
  return { id: "opp-2", businessName: "XYZ IT Services", href: "/agent/opportunities/opp-2", scheduledAt: MONDAY_MORNING.toISOString(), ...overrides };
}

function appointment(overrides: Partial<SalesCoachAppointmentRef> = {}): SalesCoachAppointmentRef {
  return { id: "appt-1", businessName: "Acme Corp", href: "/agent/opportunities/appt-1", startAt: MONDAY_MORNING.toISOString(), reminderIssue: null, ...overrides };
}

function agentData(overrides: Partial<SalesCoachAgentData> = {}): SalesCoachAgentData {
  return {
    agentId: "agent-1",
    agentName: "Henry",
    hot: [],
    warm: [],
    staleWarmOpportunities: [],
    followUpsDueToday: [],
    followUpsOverdue: [],
    interestedNeedingAction: [],
    appointmentsToday: [],
    appointmentsTomorrow: [],
    reminderIssues: [],
    weeklyPerformance: { bookedThisWeek: 0, target: 4, remainingToTarget: 4, weekLabel: "Sep 7 - Sep 11, 2026" },
    callLog: { countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 },
    hotHref: "/agent/my-opportunities?category=hot",
    warmHref: "/agent/my-opportunities?category=warm",
    ...overrides,
  };
}

function teamAgent(overrides: Partial<SalesCoachTeamAgentSummary> = {}): SalesCoachTeamAgentSummary {
  return {
    agentId: "agent-1",
    agentName: "Henry",
    hotCount: 0,
    warmCount: 0,
    followUpsOverdueCount: 0,
    followUpsDueTodayCount: 0,
    appointmentsTodayCount: 0,
    appointmentsTomorrowCount: 0,
    weeklyBooked: 0,
    weeklyTarget: 4,
    callLog: { countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 },
    agentHref: "/admin/crm/opportunity-finder?agent=agent-1",
    ...overrides,
  };
}

function teamData(overrides: Partial<SalesCoachTeamData> = {}): SalesCoachTeamData {
  return {
    agents: [],
    teamHot: 0,
    teamWarm: 0,
    teamFollowUpsOverdue: 0,
    teamFollowUpsDueToday: 0,
    teamAppointmentsToday: [],
    teamAppointmentsTomorrow: [],
    teamReminderIssues: [],
    teamWeeklyBooked: 0,
    teamWeeklyTarget: 8,
    ...overrides,
  };
}

describe("isSalesCoachWorkingDay", () => {
  it("is true Monday through Friday", () => {
    expect(isSalesCoachWorkingDay(MONDAY_MORNING)).toBe(true);
  });

  it("is false on Saturday/Sunday", () => {
    expect(isSalesCoachWorkingDay(SATURDAY)).toBe(false);
  });
});

describe("isStaleContact", () => {
  it("treats a never-contacted record as stale", () => {
    expect(isStaleContact(null, MONDAY_MORNING)).toBe(true);
  });

  it("is not stale within the 3-day window", () => {
    const oneDayAgo = new Date(MONDAY_MORNING.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(isStaleContact(oneDayAgo, MONDAY_MORNING)).toBe(false);
  });

  it("is stale at/after 3 days", () => {
    const threeDaysAgo = new Date(MONDAY_MORNING.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStaleContact(threeDaysAgo, MONDAY_MORNING)).toBe(true);
  });
});

describe("computeTeamWeeklyTarget", () => {
  it("scales dynamically with the number of active agents (section 8's own examples)", () => {
    expect(computeTeamWeeklyTarget(4, 2)).toBe(8);
    expect(computeTeamWeeklyTarget(4, 5)).toBe(20);
    expect(computeTeamWeeklyTarget(4, 0)).toBe(0);
  });
});

describe("zonedStartOfDayIso", () => {
  it("returns midnight Toronto time as a UTC instant", () => {
    const iso = zonedStartOfDayIso(MONDAY_AFTERNOON, "America/Toronto");
    // Sep 7 2026 00:00 EDT (UTC-4) = Sep 7 2026 04:00Z.
    expect(iso).toBe("2026-09-07T04:00:00.000Z");
  });
});

describe("buildAgentHeadline", () => {
  it("names hot/warm, overdue, and appointment counts along with weekly progress", () => {
    const headline = buildAgentHeadline(
      agentData({
        hot: [opportunity()],
        followUpsOverdue: [followUp()],
        appointmentsToday: [appointment()],
        weeklyPerformance: { bookedThisWeek: 3, target: 4, remainingToTarget: 1, weekLabel: "Sep 7 - Sep 11, 2026" },
      })
    );
    expect(headline).toContain("Henry");
    expect(headline).toContain("1 Hot Opportunity");
    expect(headline).toContain("overdue follow-up/callback");
    expect(headline).toContain("1 appointment today");
    expect(headline).toContain("booked 3 appointments this week against your target of 4");
  });

  it("says nothing urgent is waiting when every list is empty", () => {
    const headline = buildAgentHeadline(agentData());
    expect(headline).toContain("nothing urgent is waiting on you");
  });
});

describe("buildAgentCoachRecommendation", () => {
  it("prioritizes overdue follow-ups/callbacks above everything else", () => {
    const message = buildAgentCoachRecommendation(agentData({ hot: [opportunity()], followUpsOverdue: [followUp()] }));
    expect(message).toContain("overdue follow-up/callback");
    expect(message).toContain("more urgent than new prospecting");
  });

  it("tells the agent how close they are to target when Hot Opportunities remain", () => {
    const message = buildAgentCoachRecommendation(
      agentData({ hot: [opportunity()], weeklyPerformance: { bookedThisWeek: 3, target: 4, remainingToTarget: 1, weekLabel: "x" } })
    );
    expect(message).toBe("Follow up with your 1 Hot Opportunity first. You are only 1 appointment away from your weekly target.");
  });

  it("celebrates reaching the weekly target", () => {
    const message = buildAgentCoachRecommendation(agentData({ weeklyPerformance: { bookedThisWeek: 4, target: 4, remainingToTarget: 0, weekLabel: "x" } }));
    expect(message).toContain("already reached your weekly appointment target");
  });

  it("flags an empty pipeline with zero bookings", () => {
    const message = buildAgentCoachRecommendation(agentData());
    expect(message).toContain("no appointments booked yet this week and no Hot or Warm Opportunities");
  });

  it("flags opportunities without bookings yet", () => {
    const message = buildAgentCoachRecommendation(agentData({ warm: [opportunity()] }));
    expect(message).toContain("You have several opportunities but no appointments booked yet this week");
  });
});

describe("buildAgentRecommendedActions", () => {
  it("orders actions by the section 9 priority list and caps at 5", () => {
    const data = agentData({
      followUpsOverdue: [followUp({ businessName: "Overdue Co" })],
      hot: [opportunity({ businessName: "Hot Co" })],
      appointmentsToday: [appointment({ businessName: "Today Co" })],
      reminderIssues: [appointment({ businessName: "Reminder Co", reminderIssue: "24-hour reminder is not scheduled" })],
      appointmentsTomorrow: [appointment({ businessName: "Tomorrow Co" })],
      followUpsDueToday: [followUp({ businessName: "DueToday Co" })],
      interestedNeedingAction: [opportunity({ businessName: "Interested Co" })],
      staleWarmOpportunities: [opportunity({ businessName: "Stale Co" })],
    });
    const actions = buildAgentRecommendedActions(data);
    expect(actions).toHaveLength(5);
    expect(actions[0].label).toContain("Overdue Co");
    expect(actions[1].label).toContain("Hot Co");
    expect(actions[2].label).toContain("Today Co");
    expect(actions[3].label).toContain("Reminder Co");
    expect(actions[4].label).toContain("Tomorrow Co");
  });

  it("returns nothing when there is nothing to act on and the target is met", () => {
    const actions = buildAgentRecommendedActions(agentData({ weeklyPerformance: { bookedThisWeek: 4, target: 4, remainingToTarget: 0, weekLabel: "x" } }));
    expect(actions).toHaveLength(0);
  });
});

describe("buildCallLogReminder", () => {
  it("is null on a weekend", () => {
    expect(buildCallLogReminder({ countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 }, SATURDAY)).toBeNull();
  });

  it("shows the gentle morning reminder before 11am with no calls logged", () => {
    const reminder = buildCallLogReminder({ countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 }, MONDAY_MORNING);
    expect(reminder?.level).toBe("reminder");
  });

  it("escalates to the strong reminder at/after 11am with no calls logged", () => {
    const reminder = buildCallLogReminder({ countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 }, MONDAY_AFTERNOON);
    expect(reminder?.level).toBe("strong");
  });

  it("shows the positive status once calls have been logged", () => {
    const reminder = buildCallLogReminder({ countToday: 3, lastLoggedAt: MONDAY_MORNING.toISOString(), callbackOutcomesToday: 0 }, MONDAY_AFTERNOON);
    expect(reminder?.level).toBe("active");
    expect(reminder?.title).toBe("Call Logging Active");
  });
});

describe("buildCallLogCoachingNote", () => {
  it("is null when nothing has been logged", () => {
    expect(buildCallLogCoachingNote({ countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 })).toBeNull();
  });

  it("mentions callback outcomes needing a follow-up date", () => {
    const note = buildCallLogCoachingNote({ countToday: 18, lastLoggedAt: MONDAY_MORNING.toISOString(), callbackOutcomesToday: 2 });
    expect(note).toContain("18 calls today");
    expect(note).toContain("2 resulted in a callback");
  });
});

describe("team helpers", () => {
  it("splits agents ahead of and behind target", () => {
    const data = teamData({
      agents: [teamAgent({ agentId: "a", weeklyBooked: 4, weeklyTarget: 4 }), teamAgent({ agentId: "b", weeklyBooked: 1, weeklyTarget: 4 })],
    });
    expect(teamAgentsAheadOfTarget(data).map((a) => a.agentId)).toEqual(["a"]);
    expect(teamAgentsBehindTarget(data).map((a) => a.agentId)).toEqual(["b"]);
  });

  it("names an agent's main priority in overdue-first order", () => {
    expect(teamAgentMainPriority(teamAgent({ followUpsOverdueCount: 2 }))).toContain("overdue follow-ups/callbacks");
    expect(teamAgentMainPriority(teamAgent({ hotCount: 3 }))).toContain("Hot Opportunit");
    expect(teamAgentMainPriority(teamAgent({ weeklyBooked: 4, weeklyTarget: 4 }))).toContain("On track");
  });

  it("headline names the agents with the most acute issues and the team total", () => {
    const data = teamData({
      agents: [teamAgent({ agentId: "a", agentName: "Henry", hotCount: 3 }), teamAgent({ agentId: "b", agentName: "Goodness", followUpsOverdueCount: 2 })],
      teamWeeklyBooked: 5,
      teamWeeklyTarget: 8,
    });
    const headline = buildTeamHeadline(data);
    expect(headline).toContain("Henry has 3 Hot Opportunities");
    expect(headline).toContain("Goodness has 2 overdue follow-ups/callbacks");
    expect(headline).toContain("booked 5 appointments this week against a target of 8");
  });

  it("operations priority clears overdue work before hot opportunities before new outreach", () => {
    expect(buildTeamOperationsPriority(teamData({ teamFollowUpsOverdue: 2, teamHot: 3 }))).toContain("Clear overdue follow-ups");
    expect(buildTeamOperationsPriority(teamData({ teamHot: 3 }))).toContain("Focus the team on Hot Opportunities");
    expect(buildTeamOperationsPriority(teamData({ teamWeeklyBooked: 8, teamWeeklyTarget: 8 }))).toContain("on track");
  });

  it("recommended actions surface the worst-affected agent first, capped at 5", () => {
    const data = teamData({
      agents: [
        teamAgent({ agentId: "a", agentName: "Henry", followUpsOverdueCount: 1 }),
        teamAgent({ agentId: "b", agentName: "Goodness", followUpsOverdueCount: 3, hotCount: 2 }),
      ],
      teamReminderIssues: [appointment({ businessName: "ABC Company", reminderIssue: "24-hour reminder is not scheduled" })],
      teamAppointmentsToday: [appointment({ businessName: "Today Co" })],
    });
    const actions = buildTeamRecommendedActions(data, { performanceHref: "/admin/crm/performance" });
    expect(actions[0].label).toContain("Goodness");
    expect(actions[1].label).toContain("Goodness");
    expect(actions.length).toBeLessThanOrEqual(5);
  });
});
