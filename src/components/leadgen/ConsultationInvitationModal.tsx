"use client";

import { useState } from "react";
import { isValidEmail, type LeadgenLeadRow } from "@/lib/leadgen-types";

export type SendConsultationInvitationResult = { error?: string; emailId?: string };

// The redesigned "Send 15-Minute Consultation Invitation" flow: a fully
// pre-built email, shown as a read-only preview - no draft/edit step at
// all. The only thing the user can change here is the recipient address
// (only shown as an editable field when the lead has none on file, or is
// invalid), because that's a missing-data problem, not "writing the
// email." Exactly two actions: Send Invitation, Cancel. Distinct from
// ConsultationEmailModal (the original, still-editable "Send
// Consultation Email" / "Send Follow-Up Email" flows), which this does
// not replace or modify.
export default function ConsultationInvitationModal({
  lead,
  agentName,
  subject,
  body,
  bookingUrl,
  onClose,
  onSend,
  onSent,
}: {
  lead: LeadgenLeadRow;
  agentName: string;
  subject: string;
  body: string;
  // The exact booking-page URL rendered into `body`'s {{booking_section}}
  // - passed through so the server action can swap the plain-text
  // "[BUTTON LABEL]\n\nurl" marker for a real HTML button when actually
  // sending (see leadgenButtonHtml in lib/leadgen-email.ts). The preview
  // here stays plain text either way.
  bookingUrl: string;
  onClose: () => void;
  onSend: (formData: FormData) => Promise<SendConsultationInvitationResult>;
  onSent: () => void;
}) {
  const [toEmail, setToEmail] = useState(lead.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = isValidEmail(toEmail);

  async function handleSend() {
    if (submitting || !emailValid) return; // belt-and-suspenders against a double-click racing state updates
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("to_email", toEmail);
    formData.set("subject", subject);
    formData.set("body", body);
    formData.set("booking_url", bookingUrl);

    const result = await onSend(formData);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onSent();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={submitting ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send 15-Minute Consultation Invitation"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">Send 15-Minute Consultation Invitation</h2>
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

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-slate-500">
          <div>
            Prospect: <span className="font-medium text-slate-700">{lead.business_name}</span>
          </div>
          <div>
            Agent: <span className="font-medium text-slate-700">{agentName}</span>
          </div>
        </dl>

        <div className="mt-4 space-y-3">
          {lead.email ? (
            <p className="text-[13px] text-slate-600">
              Sending to <span className="font-semibold text-slate-900">{toEmail}</span>
            </p>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Recipient Email</span>
              <input
                type="email"
                required
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900"
              />
              <span className="text-[12px] text-amber-700">No email on file for this lead - enter one to continue.</span>
              {toEmail && !emailValid && <span className="text-[12px] text-rose-600">Enter a valid email address.</span>}
            </label>
          )}

          <div className="rounded-lg border border-slate-200 p-3.5 text-[13px]">
            <p>
              <span className="font-semibold text-slate-600">Subject:</span> {subject}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">{body}</p>
          </div>

          {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={submitting || !emailValid}
              onClick={handleSend}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send Invitation"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
