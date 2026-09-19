"use client";

import { useState } from "react";
import { IDLE_ACK_REASONS, IDLE_ACK_REASON_LABELS, type IdleAckReason } from "@/lib/attendance-pay";
import { useAgentActivityMonitor, type AcknowledgeIdleInput, type AgentActivityRowLike } from "./useAgentActivityMonitor";

// Mounted once per agent layout (both CRMs) so it runs on every
// agent-area page, not just the dashboard - "track meaningful agent
// activity while the agent is clocked in," not just while looking at one
// specific card. Renders nothing at all except the occasional 30-minute
// idle acknowledgment modal; the actual idle/break-overdue detection and
// admin notifications happen server-side inside the poll action this
// drives (see useAgentActivityMonitor + activity-actions.ts /
// leadgen-activity-actions.ts).
//
// The modal below is intentionally NOT the shared src/components/Modal.tsx
// - that one always closes on Escape/backdrop-click/its own X button,
// which this one must never do. Whether it's showing at all is driven
// entirely by row.idle_ack_pending_since, a server-persisted column, not
// any client-side timer - so a refresh or navigating to a different
// agent-area page always re-shows it while the acknowledgment is still
// outstanding, and nothing client-side can silently dismiss it.
export default function AgentActivityMonitor<T extends AgentActivityRowLike>({
  initialRow,
  pollAction,
  acknowledgeIdleAction,
}: {
  initialRow: T | null;
  pollAction: (hadInteraction: boolean) => Promise<{ row: T | null; error?: string }>;
  acknowledgeIdleAction: (input: AcknowledgeIdleInput) => Promise<{ row: T | null; error?: string }>;
}) {
  const { row, acknowledgeIdleWarning } = useAgentActivityMonitor({ initialRow, pollAction, acknowledgeIdleAction });

  const [reason, setReason] = useState<IdleAckReason | "">("");
  const [explanation, setExplanation] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!row || !row.idle_ack_pending_since) return null;

  // "Reached 45 minutes and did not acknowledge the 30-minute warning" -
  // idle_since is the existing escalation marker, still set the same way
  // it always was; its presence here just means this same still-open
  // episode has since escalated, not that a new one started.
  const escalated = !!row.idle_since;

  const canSubmit = reason !== "" && confirmed && (reason !== "other" || explanation.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await acknowledgeIdleWarning({ reason: reason as IdleAckReason, explanation: reason === "other" ? explanation : undefined });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReason("");
    setExplanation("");
    setConfirmed(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div role="alertdialog" aria-modal="true" aria-label="Idle Alert" className="w-full max-w-md rounded-2xl bg-[var(--crm-surface)] p-5 shadow-2xl">
        <h2 className="text-[17px] font-bold text-rose-700">Idle Alert</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          You have been inactive for 30 minutes. Please confirm that you are still working and provide a reason for the inactivity.
        </p>

        {escalated && (
          <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-800">
            This idle event has now been escalated after 45 minutes of inactivity. An administrator has already been notified - please
            acknowledge below to return to Active.
          </p>
        )}

        {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}

        <fieldset className="mt-4 space-y-2">
          <legend className="text-[13px] font-semibold text-slate-800">Reason for inactivity</legend>
          {IDLE_ACK_REASONS.map((value) => (
            <label key={value} className="flex items-start gap-2 text-[13.5px] text-slate-700">
              <input
                type="radio"
                name="idle-ack-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="mt-0.5"
              />
              {IDLE_ACK_REASON_LABELS[value]}
            </label>
          ))}
        </fieldset>

        {reason === "other" && (
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Briefly describe the reason for the inactivity"
            rows={3}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px]"
          />
        )}

        <label className="mt-4 flex items-start gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          I confirm that I am still working and understand that this idle event will be recorded.
        </label>

        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
          className="mt-4 w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Acknowledge & Continue"}
        </button>
      </div>
    </div>
  );
}
