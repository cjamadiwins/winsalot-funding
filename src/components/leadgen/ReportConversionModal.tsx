"use client";

import { useState } from "react";
import {
  LEADGEN_CLIENT_REPORTED_RESULTS,
  LEADGEN_CLIENT_REPORTED_RESULT_LABELS,
  LEADGEN_CLIENT_CONVERSION_CONFIRMATION_TEXT,
  type LeadgenClientReportedResult,
} from "@/lib/leadgen-conversions";

type ActionResult = { error?: string; message?: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900";

// Client Portal "Report Conversion" compact modal (brief "REPORT
// CONVERSION FORM"). Deliberately asks for nothing beyond result / date /
// sale amount / notes - never customer banking details, credit card
// information, or other confidential financial information. Submitting
// always lands on "Pending Admin Verification"; nothing here ever updates
// Winsalot billing directly (see actions.ts's reportConversionAction).
export default function ReportConversionModal({
  businessName,
  onClose,
  onSubmit,
  onSubmitted,
}: {
  businessName: string;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSubmitted: () => void;
}) {
  const [result, setResult] = useState<LeadgenClientReportedResult>("paying_customer");
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isPayingCustomer = result === "paying_customer";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (isPayingCustomer && !confirmationChecked) {
      setError(`Please check "${LEADGEN_CLIENT_CONVERSION_CONFIRMATION_TEXT}" before submitting.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("client_confirmation_checked", confirmationChecked ? "true" : "false");

    const outcome = await onSubmit(formData);
    setSubmitting(false);

    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    setSuccessMessage(outcome.message ?? "Pending Admin Verification.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={submitting ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report Conversion"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--crm-surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">Report Conversion</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">{businessName}</p>

        {successMessage ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-bold text-amber-800">Pending Admin Verification</p>
            <p className="mt-1 text-sm text-amber-700">{successMessage}</p>
            <button
              type="button"
              onClick={onSubmitted}
              className="mt-4 rounded-full bg-[var(--crm-accent,#3e7ef7)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--crm-accent-hover,#2e63d6)]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Conversion Result</span>
              <select
                name="client_reported_result"
                value={result}
                onChange={(e) => setResult(e.target.value as LeadgenClientReportedResult)}
                className={inputClass}
              >
                {LEADGEN_CLIENT_REPORTED_RESULTS.map((option) => (
                  <option key={option} value={option}>
                    {LEADGEN_CLIENT_REPORTED_RESULT_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            {isPayingCustomer && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-slate-600">Conversion Date</span>
                  <input type="date" name="client_reported_conversion_date" className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-slate-600">Sale Amount (optional)</span>
                  <input type="number" step="0.01" min="0" name="client_reported_sale_amount" placeholder="Optional" className={inputClass} />
                </label>
              </>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Notes (optional)</span>
              <textarea name="client_reported_notes" rows={3} className={`${inputClass} resize-y`} />
            </label>

            {isPayingCustomer && (
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmationChecked}
                  onChange={(e) => setConfirmationChecked(e.target.checked)}
                  className="mt-0.5"
                  required
                />
                <span>{LEADGEN_CLIENT_CONVERSION_CONFIRMATION_TEXT}</span>
              </label>
            )}

            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-[var(--crm-accent,#3e7ef7)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--crm-accent-hover,#2e63d6)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
