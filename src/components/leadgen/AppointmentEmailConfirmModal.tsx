"use client";

import { useState } from "react";

// Confirmation window for "Resend Appointment Notification" / "Send
// Appointment Reminder" (brief EMAIL FEATURES #3: "Before sending,
// display a confirmation window showing: Business name, Contact name,
// Current email address, Appointment date and time, Which email will be
// sent"). Content isn't user-editable (unlike ConsultationEmailModal) -
// this is a single confirm step, send button disabled while in flight to
// prevent an accidental double send.
export default function AppointmentEmailConfirmModal({
  mode,
  businessName,
  contactName,
  email,
  appointmentDate,
  appointmentTime,
  timezone,
  // Only offered for mode "reminder", and only to admins (brief MANUAL
  // CONTROLS: "unless the administrator explicitly chooses 'Count this
  // as the 24-hour reminder.'") - agents never see this checkbox.
  showCountAsAutomaticReminder,
  note,
  onClose,
  onConfirm,
  onSent,
}: {
  mode: "resend" | "reminder";
  businessName: string;
  contactName: string | null;
  email: string | null;
  appointmentDate: string;
  appointmentTime: string;
  timezone: string;
  showCountAsAutomaticReminder?: boolean;
  // Optional extra context line shown under the send notice - used when
  // this modal is reused as a pre-submit confirmation step for a form
  // that also saves other edits (the admin "Manage" edit panel), so the
  // admin knows saving and sending happen together. Omitted (no visual
  // change) by every other caller.
  note?: string;
  onClose: () => void;
  onConfirm: (countAsAutomaticReminder: boolean) => Promise<{ error?: string } | void>;
  onSent: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countAsAutomaticReminder, setCountAsAutomaticReminder] = useState(false);

  const title = mode === "reminder" ? "Send Appointment Reminder" : "Resend Appointment Notification";
  const actionLabel = mode === "reminder" ? "Send Reminder" : "Resend Notification";

  async function handleConfirm() {
    if (submitting) return; // belt-and-suspenders against a double-click racing state updates
    setSubmitting(true);
    setError(null);
    const result = await onConfirm(countAsAutomaticReminder);
    setSubmitting(false);
    if (result && "error" in result && result.error) {
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
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-[var(--crm-surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">{title}</h2>
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

        <dl className="mt-3 space-y-1.5 rounded-lg border border-slate-200 p-3.5 text-[13.5px]">
          <Row label="Business Name" value={businessName} />
          <Row label="Contact Name" value={contactName || "—"} />
          <Row label="Current Email" value={email || "No email on file"} />
          <Row label="Appointment" value={`${appointmentDate} ${appointmentTime} (${timezone})`} />
        </dl>

        <div className={`mt-3 rounded-lg border p-3.5 text-[13px] ${email ? "border-sky-200 bg-sky-50 text-sky-900" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {email ? (
            <p>
              This will send {mode === "reminder" ? "an appointment reminder" : "a resent appointment confirmation"} to{" "}
              <span className="font-semibold">{email}</span> right now.
            </p>
          ) : (
            <p>No email address is on file for this lead - add one before sending.</p>
          )}
        </div>

        {note && <p className="mt-2 text-[12px] text-slate-500">{note}</p>}

        {mode === "reminder" && showCountAsAutomaticReminder && (
          <label className="mt-3 flex items-start gap-2 text-[12.5px] text-slate-600">
            <input
              type="checkbox"
              checked={countAsAutomaticReminder}
              onChange={(e) => setCountAsAutomaticReminder(e.target.checked)}
              className="mt-0.5"
            />
            <span>Count this as the 24-hour reminder (skip the automatic reminder for this appointment).</span>
          </label>
        )}

        {error && <p className="mt-3 text-[13px] font-medium text-rose-600">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={submitting || !email}
            onClick={handleConfirm}
            className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending…" : actionLabel}
          </button>
          <button type="button" disabled={submitting} onClick={onClose} className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
