import { describe, expect, it } from "vitest";
import {
  agentInactivityMinutes,
  BREAK_OVERDUE_GRACE_MINUTES,
  computeAgentActivityPollPlan,
  computeAgentLiveStatus,
  computeBreakDurations,
  computeIdleDurationMinutes,
  IDLE_ACK_REASONS,
  INACTIVITY_IDLE_MINUTES,
  INACTIVITY_WARNING_MINUTES,
  isBreakSeriouslyOverdue,
  isIdleAckReason,
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
    idle_ack_pending_since: null,
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
      idleWarningTransition: "none",
      idleWarningAtIso: null,
      idleEpisodeStartIso: null,
    });
  });

  it("just refreshes last_activity_at on an ordinary heartbeat with recent activity", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(2) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: true, nowIso: NOW_ISO });
    expect(plan.attendancePatch).toEqual({ last_activity_at: NOW_ISO });
    expect(plan.idleTransition).toBe("none");
    expect(plan.notifyIdle).toBe(false);
    expect(plan.idleWarningTransition).toBe("none");
  });

  it("does nothing when there is no interaction but the agent isn't inactive long enough yet", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(INACTIVITY_WARNING_MINUTES - 1) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.attendancePatch).toBeNull();
    expect(plan.idleTransition).toBe("none");
    expect(plan.idleWarningTransition).toBe("none");
  });
});

describe("computeAgentActivityPollPlan - the 30-minute idle acknowledgment warning", () => {
  it("opens a pending acknowledgment at exactly 30 minutes, without touching idle_since", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(INACTIVITY_WARNING_MINUTES) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("open");
    expect(plan.idleWarningAtIso).toBe(NOW_ISO);
    expect(plan.attendancePatch).toEqual({ idle_ack_pending_since: NOW_ISO });
    expect(plan.idleTransition).toBe("none");
    expect(plan.notifyIdle).toBe(false);
  });

  it("sets idleEpisodeStartIso to the agent's true last activity time, NOT to the moment the warning is raised", () => {
    // Poll cadence means the warning can fire a little past exactly 30
    // minutes (here, 31) - the true idle start must still be the actual
    // last_activity_at, never "now."
    const trueLastActivity = minutesAgoIso(31);
    const row = baseRow({ last_activity_at: trueLastActivity });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("open");
    expect(plan.idleEpisodeStartIso).toBe(trueLastActivity);
    expect(plan.idleEpisodeStartIso).not.toBe(plan.idleWarningAtIso);
  });

  it("never re-opens a warning that's already pending", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(35), idle_ack_pending_since: minutesAgoIso(5) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("none");
    expect(plan.attendancePatch).toBeNull();
  });

  it("does NOT clear a pending acknowledgment just because the agent moved the mouse again", () => {
    // Only an explicit acknowledgment (or an exempted state, see below) may
    // ever clear idle_ack_pending_since - mere interaction is not enough.
    const row = baseRow({ last_activity_at: minutesAgoIso(35), idle_ack_pending_since: minutesAgoIso(5) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: true, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("none");
    expect(plan.attendancePatch).toEqual({ last_activity_at: NOW_ISO });
  });

  it("never opens a warning while the agent is on an approved break", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(90), break1_start: minutesAgoIso(10) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("none");
  });

  it("never opens a warning while the agent is on lunch", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(90), lunch_start: minutesAgoIso(5) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("none");
  });

  it("never opens a warning while the agent is marked on a call", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(90), is_on_call: true });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("none");
  });

  it("resolves an already-pending warning (no acknowledgment required) the moment the agent enters an exempted state", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(35), idle_ack_pending_since: minutesAgoIso(5), break1_start: minutesAgoIso(1) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("resolve_exempted");
    expect(plan.idleWarningAtIso).toBe(NOW_ISO);
    expect(plan.attendancePatch).toEqual({ idle_ack_pending_since: null });
  });

  it("resolves an already-pending warning when the agent goes on a call", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(35), idle_ack_pending_since: minutesAgoIso(5), is_on_call: true });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleWarningTransition).toBe("resolve_exempted");
  });
});

describe("computeAgentActivityPollPlan - the 45-minute idle escalation", () => {
  it("marks the agent Idle, escalates the already-open warning, and asks the caller to notify admins at exactly 45 minutes", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(INACTIVITY_IDLE_MINUTES), idle_ack_pending_since: minutesAgoIso(INACTIVITY_IDLE_MINUTES - INACTIVITY_WARNING_MINUTES) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("start");
    expect(plan.idleStartIso).toBe(NOW_ISO);
    expect(plan.notifyIdle).toBe(true);
    expect(plan.idleWarningTransition).toBe("escalate");
    expect(plan.idleWarningAtIso).toBe(NOW_ISO);
    expect(plan.attendancePatch).toEqual({ idle_since: NOW_ISO });
    // Still the agent's true last activity, in case the caller's
    // defensive fallback insert (no open row found to escalate) ever runs.
    expect(plan.idleEpisodeStartIso).toBe(row.last_activity_at);
  });

  it("never escalates to 45 minutes if the 30-minute warning was never opened (e.g. it was already resolved)", () => {
    // idle_ack_pending_since is null here even though inactivity is past
    // 45 minutes - computeAgentActivityPollPlan can only ever reach this
    // via the "open" branch first on a real poll cadence, but this proves
    // escalation itself doesn't fire without that precondition.
    const row = baseRow({ last_activity_at: minutesAgoIso(INACTIVITY_IDLE_MINUTES) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    // Falls into the "open" branch instead, since nothing is pending yet.
    expect(plan.idleWarningTransition).toBe("open");
    expect(plan.idleTransition).toBe("none");
  });

  it("never re-triggers the idle transition once idle_since is already set", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(90), idle_since: minutesAgoIso(45), idle_ack_pending_since: minutesAgoIso(60) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("none");
    expect(plan.notifyIdle).toBe(false);
    expect(plan.idleWarningTransition).toBe("none");
  });

  it("clears idle_since the moment real activity is seen again, but leaves the pending acknowledgment (and its session) outstanding", () => {
    const row = baseRow({ last_activity_at: minutesAgoIso(60), idle_since: minutesAgoIso(15), idle_ack_pending_since: minutesAgoIso(30) });
    const plan = computeAgentActivityPollPlan(row, { hadInteraction: true, nowIso: NOW_ISO });
    expect(plan.idleTransition).toBe("end");
    expect(plan.idleWarningTransition).toBe("none");
    expect(plan.attendancePatch).toEqual({ last_activity_at: NOW_ISO, idle_since: null });
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

describe("computeIdleDurationMinutes", () => {
  it("computes whole minutes between idle_start and idle_end", () => {
    expect(computeIdleDurationMinutes(minutesAgoIso(32), NOW_ISO)).toBe(32);
  });

  it("is never negative even for a malformed/out-of-order pair", () => {
    expect(computeIdleDurationMinutes(NOW_ISO, minutesAgoIso(5))).toBe(0);
  });
});

// End-to-end regression test for the core bug this fix addresses: idle
// duration must reflect the agent's TRUE total inactivity time (from
// their last real activity to acknowledgment), never just "from when the
// alert appeared to when they acknowledged it." Walks the same sequence
// of polls a real shift would produce.
describe("idle duration reflects true total inactivity, end to end", () => {
  it("an agent who acknowledges immediately after the 30-minute warning still shows ~30 minutes idle, not ~0", () => {
    const lastRealActivity = minutesAgoIso(30);
    let row = baseRow({ last_activity_at: lastRealActivity });

    // Poll at the 30-minute mark: warning opens.
    const openPlan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(openPlan.idleWarningTransition).toBe("open");
    const idleStart = openPlan.idleEpisodeStartIso!;
    expect(idleStart).toBe(lastRealActivity);
    row = { ...row, idle_ack_pending_since: NOW_ISO };

    // Agent acknowledges 90 seconds after the alert appeared - the bug
    // this fix addresses would have measured only these 90 seconds.
    const ackIso = new Date(new Date(NOW_ISO).getTime() + 90_000).toISOString();
    const duration = computeIdleDurationMinutes(idleStart, ackIso);

    // True duration (30 min + 90 sec = 31.5 min, rounds to 32), not ~0-1 minutes.
    expect(duration).toBe(32);
  });

  it("an agent who never acknowledges until 45+ minutes shows the full real duration at escalation and beyond", () => {
    const lastRealActivity = minutesAgoIso(50);
    const row = baseRow({
      last_activity_at: lastRealActivity,
      idle_ack_pending_since: minutesAgoIso(20), // opened 20 min ago (at the 30-min mark)
    });

    const escalatePlan = computeAgentActivityPollPlan(row, { hadInteraction: false, nowIso: NOW_ISO });
    expect(escalatePlan.idleWarningTransition).toBe("escalate");
    expect(escalatePlan.idleEpisodeStartIso).toBe(lastRealActivity);

    // Agent finally acknowledges 5 minutes after escalation (55 min real inactivity).
    const ackIso = new Date(new Date(NOW_ISO).getTime() + 5 * 60_000).toISOString();
    const duration = computeIdleDurationMinutes(escalatePlan.idleEpisodeStartIso!, ackIso);
    expect(duration).toBe(55);
  });
});

describe("idle acknowledgment reasons", () => {
  it("recognizes exactly the seven fixed reasons, including 'other'", () => {
    expect(IDLE_ACK_REASONS).toHaveLength(7);
    expect(IDLE_ACK_REASONS).toContain("other");
    for (const reason of IDLE_ACK_REASONS) {
      expect(isIdleAckReason(reason)).toBe(true);
    }
  });

  it("rejects anything outside the fixed list", () => {
    expect(isIdleAckReason("made_up_reason")).toBe(false);
    expect(isIdleAckReason("")).toBe(false);
  });
});
