"use client";

import { useState } from "react";
import { cancelWinsalotAppointmentAction } from "./actions";

export default function CancelClient({ token, contactName, appointmentLabel }: { token: string; contactName: string; appointmentLabel: string }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleCancel() {
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    const result = await cancelWinsalotAppointmentAction(token, reason.trim() ? reason.trim() : null);
    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-bold text-slate-900">Cancel Your Consultation</h1>

        {done ? (
          <p className="mt-4 text-sm text-slate-600">
            Your consultation has been cancelled. If you&apos;d like to book a new time, just visit our booking page again.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-600">Hi {contactName}, are you sure you want to cancel this consultation?</p>
            <p className="mt-1 font-semibold text-slate-900">{appointmentLabel}</p>

            <label className="mt-5 block text-left">
              <span className="text-[13px] font-semibold text-slate-600">Reason (optional)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14.5px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </label>

            {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}

            <button
              type="button"
              disabled={submitting}
              onClick={handleCancel}
              className="mt-5 w-full rounded-full bg-rose-600 px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Cancelling…" : "Cancel Consultation"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
