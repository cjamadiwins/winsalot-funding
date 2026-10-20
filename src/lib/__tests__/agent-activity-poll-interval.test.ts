import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BREAK_OVERDUE_GRACE_MINUTES, INACTIVITY_IDLE_MINUTES, INACTIVITY_WARNING_MINUTES } from "../attendance-pay";

// The attendance check-in cadence must stay well inside the smallest
// attendance threshold it has to detect, or idle/break rules drift.
describe("agent activity poll interval", () => {
  const source = readFileSync("src/components/agent-activity/useAgentActivityMonitor.ts", "utf8");
  const intervalMs = Number(/const POLL_INTERVAL_MS = ([\d_]+);/.exec(source)?.[1].replaceAll("_", ""));

  it("is a valid number", () => { expect(intervalMs).toBeGreaterThan(0); });
  it("is at most a fifth of the break-overdue grace period, so overdue breaks are caught promptly", () => {
    expect(intervalMs).toBeLessThanOrEqual((BREAK_OVERDUE_GRACE_MINUTES * 60_000) / 5);
  });
  it("is far below the inactivity warning and idle thresholds", () => {
    expect(intervalMs).toBeLessThanOrEqual((Math.min(INACTIVITY_WARNING_MINUTES, INACTIVITY_IDLE_MINUTES) * 60_000) / 20);
  });
});
