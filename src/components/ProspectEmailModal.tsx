"use client";

import { useState } from "react";
import { getDefaultProspectEmailTemplate } from "@/lib/prospect-email-templates";
import { OPPORTUNITY_TYPE_LABELS, type OpportunityType } from "@/lib/crm-types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export type SendProspectEmailResult = { error?: string; email?: string };

// "Send Email" preview/edit workflow (prospect-email system brief): a
// review screen prefilled from the correct template for this prospect's
// opportunity_type, editable (subject/message only - CTA text and the
// booking link are fixed, shown read-only) before sending, with the send
// button disabled the instant it's clicked and a visible sending
// indicator so a double-click can't fire two emails. Shared by both the
// admin and agent opportunity detail pages so the workflow can never
// drift between roles.
export default function ProspectEmailModal({
  businessName,
  contactName,
  toEmail,
  opportunityType,
  agentName,
  bookingUrl,
  onClose,
  onSend,
  onSent,
}: {
  businessName: string;
  contactName: string | null;
  toEmail: string;
  opportunityType: OpportunityType;
  agentName: string;
  bookingUrl: string;
  onClose: () => void;
  onSend: (input: { subject: string; message: string; ctaText: string }) => Promise<SendProspectEmailResult>;
  onSent: () => void;
}) {
  const defaults = getDefaultProspectEmailTemplate(opportunityType, {
    businessName,
    contactName: contactName ?? "",
    agentName,
  });

  const [subject, setSubject] = useState(defaults.subject);
  const [message, setMessage] = useState(defaults.message);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (submitting || sent) return; // belt-and-suspenders against a double-click racing state updates
    setSubmitting(true);
    setError(null);

    const result = await onSend({ subject: subject.trim(), message: message.trim(), ctaText: defaults.ctaText });

    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    setSent(true);
    onSent();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send Email"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">Send Email</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] text-slate-500">
          <div>
            Recipient name: <span className="font-medium text-slate-700">{contactName || "—"}</span>
          </div>
          <div>
            Recipient email: <span className="font-medium text-slate-700">{toEmail}</span>
          </div>
          <div>
            Business name: <span className="font-medium text-slate-700">{businessName}</span>
          </div>
          <div>
            Service type: <span className="font-medium text-slate-700">{OPPORTUNITY_TYPE_LABELS[opportunityType]}</span>
          </div>
        </dl>

        <div className="mt-4 space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required disabled={sent} className={inputClass} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              disabled={sent}
              className={`${inputClass} min-h-[260px] resize-y font-mono text-[13px]`}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[13px] sm:grid-cols-2">
            <div>
              <span className="font-semibold text-slate-600">CTA button text</span>
              <p className="mt-0.5 text-slate-700">{defaults.ctaText}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-600">Booking link</span>
              <p className="mt-0.5 truncate text-slate-700">{bookingUrl}</p>
            </div>
          </div>

          {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
          {sent && !error && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-700">
              Email sent to {toEmail}.
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={submitting || sent || !subject.trim() || !message.trim()}
              onClick={handleSend}
              className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Sending…" : sent ? "Sent" : "Send Email"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              {sent ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
