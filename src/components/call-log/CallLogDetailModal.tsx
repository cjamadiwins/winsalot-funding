"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  CALL_LOG_OUTCOME_STYLES,
  formatCallLogDateOnly,
  formatCallLogTimeOnly,
  type CallLogRow,
} from "@/lib/call-log";
import CallLogClientNoteEditor from "./CallLogClientNoteEditor";

export type CallLogDetailEntry = CallLogRow & { agentName?: string };
export type CallLogDetailClientVisibleNote = {
  updateAction: (logId: string, note: string) => Promise<{ error?: string }>;
};

// Shared detail pop-up for both the admin Call Logs list (AdminCallLogReport)
// and an agent's own "My Recent Calls" list (AgentCallLogClient) - clicking
// any row opens this instead of navigating away, so the underlying list can
// stay compact (fewer columns) while every field still reachable. Centered
// and capped at max-w-lg with its own vertical scroll, so it never needs
// horizontal scrolling regardless of note length or viewport width.
//
// Call logs have no linked follow-up/opportunity record in this schema (no
// such column or relation exists on crm_call_logs/leadgen_call_logs), so
// those two fields are simply omitted here rather than shown empty -
// matching the existing convention below (client_visible_note only renders
// when the caller actually has one).
export default function CallLogDetailModal({
  entry,
  onClose,
  clientVisibleNote,
}: {
  entry: CallLogDetailEntry;
  onClose: () => void;
  // Only the Lead Generation CRM's admin list passes this - see
  // AdminCallLogReport for why (leadgen_call_logs-only column). When
  // present, the note becomes editable right here instead of a second
  // dedicated column in the compact table.
  clientVisibleNote?: CallLogDetailClientVisibleNote;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="call-log-detail-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="call-log-detail-title" className="text-lg font-bold text-slate-900">
            Call Details
          </h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Field label="Date">{formatCallLogDateOnly(entry.created_at)}</Field>
          <Field label="Exact Time">{formatCallLogTimeOnly(entry.created_at)} ET</Field>
          {entry.agentName && (
            <Field label="Agent" span>
              {entry.agentName}
            </Field>
          )}
          <Field label="Business / Prospect" span>
            {entry.business_name}
          </Field>
          <Field label="Client / Business Assignment" span>
            {entry.businessClient}
          </Field>
          <Field label="Phone">{entry.phone}</Field>
          <Field label="Result">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${CALL_LOG_OUTCOME_STYLES[entry.outcome]}`}>
              {entry.outcome}
            </span>
          </Field>
          <Field label="Call Notes" span>
            <span className="whitespace-pre-wrap">{entry.notes}</span>
          </Field>
          {clientVisibleNote ? (
            <Field label="Client-Visible Note" span>
              <CallLogClientNoteEditor
                logId={entry.id}
                initialNote={entry.client_visible_note}
                updateAction={clientVisibleNote.updateAction}
              />
            </Field>
          ) : entry.client_visible_note ? (
            <Field label="Client-Visible Note" span>
              <span className="whitespace-pre-wrap">{entry.client_visible_note}</span>
            </Field>
          ) : null}
        </dl>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, span, children }: { label: string; span?: boolean; children: ReactNode }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-800">{children}</dd>
    </div>
  );
}
