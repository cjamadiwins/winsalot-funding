import { describe, expect, it } from "vitest";
import {
  agentInactivityMinutes,
  BREAK_OVERDUE_GRACE_MINUTES,
  computeAgentActivityPollPlan,
  computeAgentLiveStatus,
  computeBreakDurations,
  INACTIVITY_IDLE_MINUTES,
  INACTIVITY_WARNING_MINUTES,
  isBreakSeriouslyOverdue,
  type AgentActivityRow,
} from "../attendance-pay";

const NOW = new Date("2026-01-15T18:00:00.000Z");
const NOW_ISO = NOW.toISOString();
const NOW_MS = NOW.getTime();

function minutesAgoIso(minutes: number): string {
  return new Date(NOW_MS - minutes * 60_000).toISOString();
}

function baseRow(overrides: Partial<AgentActivityRow> = {}): AgentActivityRow {
  return {
    clock_in: minutesAgoIso(120),
    clock_out: null,
    break1_start: null,
    break1_end: null,
    lunch_start: null,
    lunch_end: null,
    break2_start: null,
    break2_end: null,
    last_activity_at: minutesAgoIso(0),
    idle_since: null,
    is_on_call: false,
    break1_overdue_notified_at: null,
    lunch_overdue_notified_at: null,
    break2_overdue_notified_at: null,
    ...overrides,
  };
}

describe("computeAgentActivityPollPlan - clocked-out and heartbeat basics", () => {
  it("does nothing at all for a clocked-out agent", () => {
    const row = baseRow({ clock_out: NOW_ISO, last_activity_at: minutesAgoIso(90) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan).toEqual({
      attendancePatch: null,
      idleTransition: "none",
      idleStartIso: null,
      notifyIdle: false,
      overdueStagesToNotify: [],
    });
  });

  it("just refreshes last_activity_at on an ordinary heartbeat with recent activity", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(2) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: true, nowIso: NOW_ISO });
    expect(plan.attendancePatch).toEqual({ last_activity_at: NOW_ISO });
    expect(plan.idleTransition).toBe("none");
    expect(plan.notifyIdle).toBe(false);
  });

  it("does nothing when there is no interaction but the agent isn't inactive long enough yet", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(INACTIVITY_WARNING_MINUTES) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.attendancePatch).toBeNull();
    expect(plan.idleTransition).toBe("none");
  });
});

describe("computeAgentActivityPollPlan - the 45-minute idle transition", () => {
  it("marks the agent Idle, opens an idle session, and asks the caller to notify admins at exactly 45 minutes", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(INACTIVITY_IDLE_MINUTES) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("start");
    expect(plan.idleStartIso).toBe(NOW_ISO);
    expect(plan.notifyIdle).toBe(true);
    expect(plan.attendancePatch).toEqual({ idle_since: NOW_ISO });
  });

  it("never re-triggers the idle transition once idle_since is already set", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(90), idle_since: minutesAgoIso(45) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("none");
    expect(plan.notifyIdle).toBe(false);
  });

  it("clears idle_since and ends the idle session the moment real activity is seen again", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(60), idle_since: minutesAgoIso(15) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: true, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("end");
    expect(plan.attendancePatch).toEqual({ last_activity_at: NOW_ISO, idle_since: null });
  });

  it("never starts an inactivity clock while the agent is on an approved break", () => {
    const row = baseRow({
      last_activity_at: minutesAgoIso(90),
      break1_start: minutesAgoIso(10),
    });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("none");
  });

  it("never starts an inactivity clock while the agent is on lunch", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(90), lunch_start: minutesAgoIso(5) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("none");
  });

  it("never starts an inactivity clock while the agent is marked on a call", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(90), is_on_call: true });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("none");
  });
});

describe("computeAgentActivityPollPlan - break/lunch overdue admin alerts", () => {
  it("flags Break 1 overdue and asks the caller to notify admins once it's 5+ minutes past the 15-minute limit", () => {
    const row = baseRow({ break1_start: minutesAgoIso(15 + BREAK_OVERDUE_GRACE_MINUTES) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.overdueStagesToNotify).toEqual(["break1"]);
    expect(plan.attendancePatch).toEqual({ break1_overdue_notified_at: NOW_ISO });
  });

  it("does not yet flag Break 1 overdue at exactly the 15-minute mark (before the grace period)", () => {
    const row = baseRow({ break1_start: minutesAgoIso(15) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.overdueStagesToNotify).toEqual([]);
  });

  it("flags Lunch overdue once it's 5+ minutes past the 30-minute limit", () => {
    const row = baseRow({ lunch_start: minutesAgoIso(30 + BREAK_OVERDUE_GRACE_MINUTES) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.overdueStagesToNotify).toEqual(["lunch"]);
  });

  it("never re-notifies for a break already flagged as overdue", () => {
    const row = baseRow({
      break2_start: minutesAgoIso(25),
      break2_overdue_notified_at: minutesAgoIso(3),
    });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.overdueStagesToNotify).toEqual([]);
    expect(plan.attendancePatch).toBeNull();
  });

  it("a completed (not currently open) break is never flagged, however long ago it ran over", () => {
    const row = baseRow({ break1_start: minutesAgoIso(120), break1_end: minutesAgoIso(90) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.overdueStagesToNotify).toEqual([]);
  });
});

describe("computeAgentLiveStatus", () => {
  it("maps every state to the compact five-value status the brief asks for", () => {
    expect(computeAgentLiveStatus(baseRow({ clock_out: NOW_ISO }))).toBe("clocked_out");
    expect(computeAgentLiveStatus(baseRow({ break1_start: minutesAgoIso(1) }))).toBe("on_break");
    expect(computeAgentLiveStatus(baseRow({ lunch_start: minutesAgoIso(1) }))).toBe("on_lunch");
    expect(computeAgentLiveStatus(baseRow({ idle_since: minutesAgoIso(1) }))).toBe("idle");
    expect(computeAgentLiveStatus(baseRow())).toBe("active");
    // Being on a call isn't one of the five listed buckets - it reads as Active.
    expect(computeAgentLiveStatus(baseRow({ is_on_call: true }))).toBe("active");
  });
});

describe("agentInactivityMinutes / isBreakSeriouslyOverdue", () => {
  it("computes elapsed minutes since the last heartbeat", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(12) });
    expect(agentInactivityMinutes(row, NOW_MS)).toBeCloseTo(12, 5);
  });

  it("is never negative even if last_activity_at is somehow in the future", () => {
    const row = baseRow({ last_activity_at: new Date(NOW_MS + 60_000).toISOString() });
    expect(agentInactivityMinutes(row, NOW_MS)).toBe(0);
  });

  it("matches the grace-window boundary exactly", () => {
    const justUnder = computeBreakDurations(baseRow({ break1_start: minutesAgoIso(15 + BREAK_OVERDUE_GRACE_MINUTES - 1) }), NOW_ISO).break1;
    const atBoundary = computeBreakDurations(baseRow({ break1_start: minutesAgoIso(15 + BREAK_OVERDUE_GRACE_MINUTES) }), NOW_ISO).break1;
    expect(isBreakSeriouslyOverdue(justUnder)).toBe(false);
    expect(isBreakSeriouslyOverdue(atBoundary)).toBe(true);
  });
});
