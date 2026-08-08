"use client";

import { useState } from "react";
import { CLOSED_STAGES, type CloseOutcome, type CrmLeadRow, type LeadStage } from "@/lib/crm-types";

type ClosableLead = Pick<CrmLeadRow, "stage" | "closed_reason" | "closed_at">;

// Shared by both /agent/leads/[id] and /admin/crm/leads/[id] - the only UI
// path to Closed – Won/Closed – Lost for either role, so the "closing
// reason required" rule only has to be built once. A lead that's already
// closed shows a read-only summary instead of the two buttons; there's no
// "reopen" control here since that's not something either brief asked for.
export default function CloseLeadPanel({
  leadId,
  lead,
  isPending,
  closeAction,
  onClosed,
  embedded = false,
}: {
  leadId: string;
  lead: ClosableLead;
  isPending: boolean;
  closeAction: (leadId: string, outcome: string, reason: string) => Promise<void>;
  onClosed?: () => void;
  // True when rendered inside another container that already provides its
  // own card chrome (e.g. the Modal used by the dashboard's quick-action
  // panel) - drops this component's own outer margin/border/background so
  // it doesn't nest a second card inside the first.
  embedded?: boolean;
}) {
  const [choosing, setChoosing] = useState<CloseOutcome | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const alreadyClosed = CLOSED_STAGES.includes(lead.stage as LeadStage);

  if (alreadyClosed) {
    const won = lead.stage === "Closed – Won";
    return (
      <div
        className={`rounded-2xl border p-5 ${embedded ? "" : "mt-6"} ${
          won ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
        }`}
      >
        <h2
          className={`text-xs font-semibold uppercase tracking-wide ${
            won ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {lead.stage}
        </h2>
        {lead.closed_reason && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{lead.closed_reason}</p>
        )}
        {lead.closed_at && (
          <p className="mt-2 text-xs text-slate-500">
            Closed {new Date(lead.closed_at).toLocaleString()}
          </p>
        )}
      </div>
    );
  }

  async function handleConfirm() {
    if (!choosing) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("A closing reason or short note is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await closeAction(leadId, choosing, trimmed);
      setChoosing(null);
      setReason("");
      onClosed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close the lead.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={embedded ? "" : "mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5"}>
      {!embedded && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Close Lead</h2>
          <p className="mt-2 text-sm text-slate-600">
            Closing a lead requires a short reason or note, recorded on its activity timeline for
            reporting.
          </p>
        </>
      )}

      {!choosing ? (
        <div className={embedded ? "grid grid-cols-1 gap-2.5" : "mt-3 flex flex-wrap gap-3"}>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setChoosing("won");
              setError(null);
            }}
            className={
              embedded
                ? "min-h-[48px] rounded-xl bg-emerald-600 px-4 py-3 text-[15px] font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                : "rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            Mark Closed – Won
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setChoosing("lost");
              setError(null);
            }}
            className={
              embedded
                ? "min-h-[48px] rounded-xl bg-rose-600 px-4 py-3 text-[15px] font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                : "rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            Mark Closed – Lost
          </button>
        </div>
      ) : (
        <div className={embedded ? "space-y-3" : "mt-3 space-y-2.5"}>
          <p className="text-sm font-medium text-slate-800">
            {choosing === "won" ? "Mark Closed – Won" : "Mark Closed – Lost"}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this lead closing? (required)"
            required
            autoFocus
            className="w-full min-h-[80px] resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          <div className={embedded ? "grid grid-cols-1 gap-2.5" : "flex flex-wrap gap-3"}>
            <button
              type="button"
              disabled={submitting || isPending || !reason.trim()}
              onClick={handleConfirm}
              className={
                embedded
                  ? `min-h-[48px] rounded-xl px-4 py-3 text-[15px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      choosing === "won" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                    }`
                  : `rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      choosing === "won" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                    }`
              }
            >
              Save
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setChoosing(null);
                setReason("");
                setError(null);
              }}
              className="text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
    </div>
  );
}
