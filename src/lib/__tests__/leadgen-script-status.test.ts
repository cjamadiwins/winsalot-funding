import { describe, expect, it } from "vitest";
import {
  SCRIPT_CLOSED_GRACE_MS,
  SCRIPT_DISPLAY,
  SCRIPT_HEARTBEAT_STALE_MS,
  SCRIPT_NOTIFY_COOLDOWN_MS,
  deriveScriptDisplayState,
  planScriptStateUpdate,
  type ScriptStatusRow,
} from "../leadgen-script-status";

const t0 = new Date("2026-09-30T15:00:00.000Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

// Applies a plan the way the server action does.
function apply(prev: ScriptStatusRow | null, input: { open: boolean; working: boolean }, now: Date) {
  const { patch, notify } = planScriptStateUpdate(prev, input, now);
  return { row: patch as ScriptStatusRow, notify };
}

describe("planScriptStateUpdate", () => {
  it("notifies once when the script is opened, then never again on heartbeats", () => {
    const first = apply(null, { open: true, working: true }, t0);
    let row = first.row;
    expect(first.notify).toEqual(["opened"]);
    expect(row.opened_at).toBe(t0.toISOString());
    for (let i = 1; i <= 10; i++) {
      const next = apply(row, { open: true, working: true }, at(i * 60_000));
      expect(next.notify).toEqual([]);
      row = next.row;
    }
    expect(row.opened_at).toBe(t0.toISOString());
  });

  it("does not notify on open/close flapping within the cooldown", () => {
    let { row } = apply(null, { open: true, working: true }, t0);
    ({ row } = apply(row, { open: false, working: true }, at(10_000)));
    const reopened = apply(row, { open: true, working: true }, at(20_000));
    expect(reopened.notify).toEqual([]);
  });

  it("re-notifies an open after the cooldown", () => {
    let { row } = apply(null, { open: true, working: true }, t0);
    ({ row } = apply(row, { open: false, working: false }, at(60_000)));
    const later = at(SCRIPT_NOTIFY_COOLDOWN_MS + 120_000);
    const reopened = apply(row, { open: true, working: true }, later);
    expect(reopened.notify).toEqual(["opened"]);
  });

  it("flags closed-while-working only after the grace period, once per episode", () => {
    const first = apply(null, { open: false, working: true }, t0);
    let { row, notify } = first;
    expect(notify).toEqual([]); // just arrived - script may be about to open
    ({ row, notify } = apply(row, { open: false, working: true }, at(SCRIPT_CLOSED_GRACE_MS / 2)));
    expect(notify).toEqual([]);
    ({ row, notify } = apply(row, { open: false, working: true }, at(SCRIPT_CLOSED_GRACE_MS + 1_000)));
    expect(notify).toEqual(["closed_working"]);
    for (let i = 2; i < 40; i++) {
      const next = apply(row, { open: false, working: true }, at(i * 60_000 + SCRIPT_CLOSED_GRACE_MS));
      expect(next.notify).toEqual([]); // same episode, even past the cooldown
      row = next.row;
    }
  });

  it("does not flag a closed script when the agent is not working a list", () => {
    const { row } = apply(null, { open: false, working: false }, t0);
    const next = apply(row, { open: false, working: false }, at(10 * 60_000));
    expect(next.notify).toEqual([]);
    expect(next.row.is_working).toBe(false);
  });

  it("an agent who closes the open script while working is flagged after the grace period", () => {
    let { row } = apply(null, { open: true, working: true }, t0);
    ({ row } = apply(row, { open: false, working: true }, at(30_000)));
    const still = apply(row, { open: false, working: true }, at(30_000 + SCRIPT_CLOSED_GRACE_MS));
    expect(still.notify).toEqual(["closed_working"]);
  });

  it("treats a stale row as a new episode (agent left and came back)", () => {
    const { row } = apply(null, { open: true, working: true }, t0);
    const back = at(SCRIPT_NOTIFY_COOLDOWN_MS + SCRIPT_HEARTBEAT_STALE_MS + 1);
    const result = apply(row, { open: false, working: true }, back);
    expect(result.row.closed_since).toBe(back.toISOString());
    expect(result.notify).toEqual([]);
  });
});

describe("deriveScriptDisplayState", () => {
  const base: ScriptStatusRow = {
    script_open: true,
    is_working: true,
    opened_at: t0.toISOString(),
    closed_since: null,
    last_activity_at: t0.toISOString(),
    last_heartbeat_at: t0.toISOString(),
    last_opened_notified_at: null,
    last_closed_notified_at: null,
  };
  it("maps live/stale rows to display states", () => {
    expect(deriveScriptDisplayState(null, t0)).toBe("never_opened");
    expect(deriveScriptDisplayState(base, at(30_000))).toBe("open");
    expect(deriveScriptDisplayState({ ...base, script_open: false }, at(30_000))).toBe("closed_working");
    expect(deriveScriptDisplayState({ ...base, script_open: false, is_working: false }, at(30_000))).toBe("closed");
    expect(deriveScriptDisplayState(base, at(SCRIPT_HEARTBEAT_STALE_MS + 1))).toBe("inactive");
  });
  it("only uses green/amber/gray tones", () => {
    for (const d of Object.values(SCRIPT_DISPLAY)) expect(["green", "amber", "gray"]).toContain(d.tone);
  });
});
