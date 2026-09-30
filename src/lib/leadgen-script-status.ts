// Lead Generation CRM: automatic Approved Call Script open/closed tracking.
// Pure state-transition + display logic (no I/O) so the duplicate-notification
// rules are unit-testable. Only the CRM script-panel state is ever tracked.

export const SCRIPT_HEARTBEAT_INTERVAL_MS = 60_000;
// A heartbeat older than this means the agent is no longer on the CRM.
export const SCRIPT_HEARTBEAT_STALE_MS = 3 * 60_000;
// "Closed while working" must persist this long before Admin is told, so a
// panel that is about to auto-open (or was closed by accident) never pings.
export const SCRIPT_CLOSED_GRACE_MS = 60_000;
// Minimum gap between two notifications of the same kind for one agent+list.
export const SCRIPT_NOTIFY_COOLDOWN_MS = 30 * 60_000;

export type ScriptStatusRow = {
  script_open: boolean;
  is_working: boolean;
  opened_at: string | null;
  closed_since: string | null;
  last_activity_at: string | null;
  last_heartbeat_at: string | null;
  last_opened_notified_at: string | null;
  last_closed_notified_at: string | null;
};

export type ScriptNotificationKind = "opened" | "closed_working";

export type ScriptStatusPatch = {
  script_open: boolean;
  is_working: boolean;
  opened_at: string | null;
  closed_since: string | null;
  last_activity_at: string | null;
  last_heartbeat_at: string;
  last_opened_notified_at: string | null;
  last_closed_notified_at: string | null;
};

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

export function isHeartbeatLive(lastHeartbeatAt: string | null, now: Date): boolean {
  const t = ms(lastHeartbeatAt);
  return t !== null && now.getTime() - t < SCRIPT_HEARTBEAT_STALE_MS;
}

export function planScriptStateUpdate(
  prev: ScriptStatusRow | null,
  input: { open: boolean; working: boolean },
  now: Date
): { patch: ScriptStatusPatch; notify: ScriptNotificationKind[] } {
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const wasLive = !!prev && isHeartbeatLive(prev.last_heartbeat_at, now);
  const wasOpen = wasLive && prev!.script_open;
  const notify: ScriptNotificationKind[] = [];

  const openedAt = input.open && !wasOpen ? nowIso : (prev?.opened_at ?? null);
  // A closed episode continues only while heartbeats are live and it stayed closed.
  const closedSince = input.open ? null : wasLive && !prev!.script_open && prev!.closed_since ? prev!.closed_since : nowIso;

  const stateChanged = !prev || prev.script_open !== input.open || !wasLive;
  const lastActivity = stateChanged || input.open ? nowIso : (prev?.last_activity_at ?? nowIso);

  let lastOpenedNotified = prev?.last_opened_notified_at ?? null;
  let lastClosedNotified = prev?.last_closed_notified_at ?? null;

  if (input.open && !wasOpen) {
    const last = ms(lastOpenedNotified);
    if (last === null || nowMs - last >= SCRIPT_NOTIFY_COOLDOWN_MS) {
      notify.push("opened");
      lastOpenedNotified = nowIso;
    }
  }

  if (!input.open && input.working && closedSince) {
    const closedMs = new Date(closedSince).getTime();
    const last = ms(lastClosedNotified);
    const alreadyThisEpisode = last !== null && last >= closedMs;
    if (nowMs - closedMs >= SCRIPT_CLOSED_GRACE_MS && !alreadyThisEpisode && (last === null || nowMs - last >= SCRIPT_NOTIFY_COOLDOWN_MS)) {
      notify.push("closed_working");
      lastClosedNotified = nowIso;
    }
  }

  return {
    patch: {
      script_open: input.open,
      is_working: input.working,
      opened_at: openedAt,
      closed_since: closedSince,
      last_activity_at: lastActivity,
      last_heartbeat_at: nowIso,
      last_opened_notified_at: lastOpenedNotified,
      last_closed_notified_at: lastClosedNotified,
    },
    notify,
  };
}

// Admin display states. Green = open; amber = closed while working / never
// opened; gray = closed or not currently on the CRM. Never red.
export type ScriptDisplayState = "open" | "closed_working" | "closed" | "inactive" | "never_opened";

export const SCRIPT_DISPLAY: Record<ScriptDisplayState, { label: string; tone: "green" | "amber" | "gray" }> = {
  open: { label: "Script Open", tone: "green" },
  closed_working: { label: "Script Closed — working list", tone: "amber" },
  closed: { label: "Script Closed", tone: "gray" },
  inactive: { label: "Script Closed — not currently active", tone: "gray" },
  never_opened: { label: "Script Closed — not opened yet", tone: "amber" },
};

export function deriveScriptDisplayState(row: ScriptStatusRow | null, now: Date): ScriptDisplayState {
  if (!row) return "never_opened";
  if (!isHeartbeatLive(row.last_heartbeat_at, now)) return "inactive";
  if (row.script_open) return "open";
  return row.is_working ? "closed_working" : "closed";
}
