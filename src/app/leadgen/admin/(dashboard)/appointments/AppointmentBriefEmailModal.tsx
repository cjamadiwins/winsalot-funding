"use client";

import { useEffect, useState } from "react";
import type { BriefEmailPreview } from "./prep-actions";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

// Compact review-and-confirm step for "Send Appointment Brief". Nothing is
// sent until Admin presses Send here. The recipients shown are what the server
// resolved from the client record (and will re-resolve when sending); only the
// subject and body are editable.
export default function AppointmentBriefEmailModal({
  preview,
  resend,
  onCancel,
  onSend,
}: {
  preview: BriefEmailPreview;
  resend: boolean;
  onCancel: () => void;
  onSend: (email: { subject: string; body: string }) => Promise<{ error?: string }>;
}) {
  const [subject, setSubject] = useState(preview.subject);
  const [body, setBody] = useState(preview.body);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes only this step, not the Prepare Appointment modal beneath it.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      if (!submitting) onCancel();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, submitting]);

  async function handleSend() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onSend({ subject, body });
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send Appointment Brief"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-[var(--crm-surface)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-[16px] font-bold text-slate-900">{resend ? "Re-send Appointment Brief" : "Send Appointment Brief"}</h2>
          <button type="button" onClick={onCancel} disabled={submitting} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            ✕
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-400">Client</dt>
              <dd className="min-w-0 break-words font-medium text-slate-800">{preview.clientName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-400">Prospect</dt>
              <dd className="min-w-0 break-words font-medium text-slate-800">{preview.prospect}</dd>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <dt className="w-16 shrink-0 text-slate-400">To</dt>
              <dd className="min-w-0 break-words font-medium text-slate-800">{preview.recipients.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(", ")}</dd>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <dt className="w-16 shrink-0 text-slate-400">When</dt>
              <dd className="min-w-0 break-words font-medium text-slate-800">{preview.when}</dd>
            </div>
          </dl>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={inputClass} />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Email Body · editable</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className={`${inputClass} min-h-[260px] resize-y font-mono text-[12.5px] leading-relaxed`} />
          </label>
          <p className="text-[11.5px] text-slate-400">
            This is separate from the appointment confirmation and reminders, which are not re-sent. The brief is saved first; nothing is emailed until you press Send.
          </p>

          {error && <p className="text-[12.5px] font-medium text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onCancel} disabled={submitting} className="rounded-full border border-slate-300 px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={submitting || !subject.trim() || !body.trim()}
            className="rounded-full bg-sky-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
