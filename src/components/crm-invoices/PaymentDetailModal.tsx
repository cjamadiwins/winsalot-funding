"use client";

import { useState, useTransition } from "react";
import type { CrmPaymentRow } from "@/lib/crm-clients-types";
import { formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/crm-clients-types";

type ActionResult = { error?: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Backs both "View payment details" and "Edit payment details" in the
// Recent Payments Manage menu - the same modal, opened in the matching
// mode, since the two only differ in whether the fields are editable.
export default function PaymentDetailModal({
  payment,
  clientName,
  mode,
  updateAction,
  onClose,
  onSaved,
}: {
  payment: CrmPaymentRow;
  clientName: string;
  mode: "view" | "edit";
  updateAction: (paymentId: string, formData: FormData) => Promise<ActionResult>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateAction(payment.id, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">{mode === "edit" ? "Edit Payment Details" : "Payment Details"}</h3>
        <p className="mt-1 text-[12.5px] text-slate-500">{clientName}</p>

        {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}

        {mode === "view" ? (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Date</span>
              <span className="font-medium">{formatDate(payment.payment_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount</span>
              <span className="font-medium">{formatCurrency(payment.amount, payment.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Method</span>
              <span className="font-medium">{payment.payment_method ? PAYMENT_METHOD_LABELS[payment.payment_method] : "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reference #</span>
              <span className="font-medium">{payment.reference_number || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Recorded By</span>
              <span className="font-medium">{payment.recorded_by_name}</span>
            </div>
            {payment.notes && (
              <div>
                <span className="text-slate-500">Notes</span>
                <p className="mt-1 text-[13px]">{payment.notes}</p>
              </div>
            )}
            {payment.reversed_at && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
                Reversed on {formatDate(payment.reversed_at.slice(0, 10))}
                {payment.reversal_reason ? `: ${payment.reversal_reason}` : ""}
              </p>
            )}
          </div>
        ) : (
          <form action={handleSubmit} className="mt-4 space-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Amount *</span>
              <input type="number" step="0.01" min="0.01" name="amount" required defaultValue={payment.amount} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Date</span>
              <input type="date" name="payment_date" defaultValue={payment.payment_date} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Method</span>
              <select name="payment_method" defaultValue={payment.payment_method ?? ""} className={inputClass}>
                <option value="">-</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Reference #</span>
              <input type="text" name="reference_number" defaultValue={payment.reference_number ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Notes</span>
              <input type="text" name="notes" defaultValue={payment.notes ?? ""} className={inputClass} />
            </label>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
                {isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        )}

        {mode === "view" && (
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
