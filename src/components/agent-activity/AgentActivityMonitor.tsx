"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { activeBreakStage, agentInactivityMinutes, INACTIVITY_WARNING_MINUTES } from "@/lib/attendance-pay";
import { useAgentActivityMonitor, type AgentActivityRowLike } from "./useAgentActivityMonitor";

// Mounted once per agent layout (both CRMs) so it runs on every
// agent-area page, not just the dashboard - "track meaningful agent
// activity while the agent is clocked in," not just while looking at one
// specific card. Renders nothing at all except the occasional 30-minute
// warning modal; the actual idle/break-overdue detection and admin
// notifications happen server-side inside the poll action this drives
// (see useAgentActivityMonitor + activity-actions.ts /
// leadgen-activity-actions.ts) - deliberately invisible otherwise, per
// the brief's "should not feel aggressive or disruptive."
export default function AgentActivityMonitor<T extends AgentActivityRowLike>({
  initialRow,
  pollAction,
}: {
  initialRow: T | null;
  pollAction: (hadInteraction: boolean) => Promise<{ row: T | null; error?: string }>;
}) {
  const { row, acknowledgeStillWorking } = useAgentActivityMonitor({ initialRow, pollAction });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!row) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [row]);

  // The warning is purely a local, client-side read of the last-synced
  // row - never shown once the server has already promoted the agent to
  // Idle (idle_since set), while on an approved break/lunch, or while
  // marked as being on a call - exactly the exceptions list in the brief.
  const showWarning = useMemo(() => {
    if (!row || row.idle_since || row.is_on_call) return false;
    if (activeBreakStage(row)) return false;
    return agentInactivityMinutes(row, now) >= INACTIVITY_WARNING_MINUTES;
  }, [row, now]);

  if (!showWarning) return null;

  return (
    <Modal title="Still there?" onClose={acknowledgeStillWorking}>
      <p className="text-sm text-[var(--color-text-muted)]">
        You&rsquo;ve been inactive for 30 minutes. Are you still working?
      </p>
      <button
        type="button"
        onClick={acknowledgeStillWorking}
        className="mt-4 w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        I&rsquo;m Still Working
      </button>
    </Modal>
  );
}
