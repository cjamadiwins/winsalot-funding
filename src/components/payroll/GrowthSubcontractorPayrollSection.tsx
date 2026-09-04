"use client";

// Growth CRM's Subcontractor Payments section, inside Payroll (brief
// section H) - separate from Employee/Agent Payroll above it on the same
// page. Payment records only; full profile/onboarding/agreement/training/
// permissions management lives at /admin/crm/subcontractors (see that
// area's own pages) - this section links there per subcontractor rather
// than duplicating that UI. Reads the extended crm_subcontractor_payments
// schema (migration 0136: rate/currency/pay-type/client snapshots, 4-state
// status) - entirely separate component from the shared
// SubcontractorsAdminSection.tsx, which continues to serve the Lead
// Generation CRM's own (unmodified) Subcontractor Payments feature.

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  SUBCONTRACTOR_PAYMENT_STATUS_BADGE_CLASSES,
  SUBCONTRACTOR_PAYMENT_STATUS_LABELS,
  type SubcontractorPaymentRecordRow,
  type SubcontractorPaymentStatus,
  type SubcontractorProfileRow,
} from "@/lib/crm-subcontractor-types";
import {
  calculateSubcontractorGrossPay,
  calculateSubcontractorNetPay,
  formatSubcontractorCurrency,
  isQuantityBasedPayType,
  SUBCONTRACTOR_QUANTITY_LABELS,
} from "@/lib/subcontractor-payroll";
import { formatDateShort } from "@/lib/payroll";

type ActionResult = { error?: string };

type Props = {
  subcontractors: SubcontractorProfileRow[];
  payments: SubcontractorPaymentRecordRow[];
  createPaymentAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  updatePaymentAction: (paymentId: string, formData: FormData) => Promise<ActionResult>;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-slate-500";

function StatusBadge({ status }: { status: SubcontractorPaymentStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SUBCONTRACTOR_PAYMENT_STATUS_BADGE_CLASSES[status]}`}>
      {SUBCONTRACTOR_PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

function PaymentForm({
  subcontractor,
  payment,
  onSubmit,
  submitLabel,
}: {
  subcontractor: SubcontractorProfileRow;
  payment?: SubcontractorPaymentRecordRow;
  onSubmit: (formData: FormData) => void;
  submitLabel: string;
}) {
  const quantityBased = isQuantityBasedPayType(subcontractor.pay_type);
  const [quantity, setQuantity] = useState(String(payment?.quantity ?? ""));
  const [grossPay, setGrossPay] = useState(String(payment?.gross_pay ?? subcontractor.pay_rate));
  const [adjustments, setAdjustments] = useState(String(payment?.adjustments ?? 0));
  const [deductions, setDeductions] = useState(String(payment?.deductions ?? 0));
  const [status, setStatus] = useState<SubcontractorPaymentStatus>(payment?.status ?? "draft");

  const effectiveGrossPay = quantityBased
    ? calculateSubcontractorGrossPay(subcontractor.pay_type, Number(quantity) || 0, subcontractor.pay_rate)
    : Number(grossPay) || 0;
  const netPay = calculateSubcontractorNetPay({ grossPay: effectiveGrossPay, adjustments: Number(adjustments) || 0, deductions: Number(deductions) || 0 });

  return (
    <form action={onSubmit} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Period Start</label>
          <input type="date" name="period_start" required defaultValue={payment?.period_start} className={`${inputClasses} mt-1`} />
        </div>
        <div>
          <label className={labelClasses}>Period End</label>
          <input type="date" name="period_end" required defaultValue={payment?.period_end} className={`${inputClasses} mt-1`} />
        </div>
      </div>

      {quantityBased ? (
        <div>
          <label className={labelClasses}>{SUBCONTRACTOR_QUANTITY_LABELS[subcontractor.pay_type]}</label>
          <input type="number" name="quantity" min={0} step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inputClasses} mt-1`} />
          <p className="mt-1 text-xs text-slate-500">
            Gross Pay = {SUBCONTRACTOR_QUANTITY_LABELS[subcontractor.pay_type]} x Rate ={" "}
            {formatSubcontractorCurrency(effectiveGrossPay, subcontractor.currency)}
          </p>
        </div>
      ) : (
        <div>
          <label className={labelClasses}>Gross Pay ({subcontractor.currency})</label>
          <input type="number" name="gross_pay" min={0} step="0.01" required value={grossPay} onChange={(e) => setGrossPay(e.target.value)} className={`${inputClasses} mt-1`} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Adjustments ({subcontractor.currency})</label>
          <input type="number" name="adjustments" min={0} step="0.01" value={adjustments} onChange={(e) => setAdjustments(e.target.value)} className={`${inputClasses} mt-1`} />
        </div>
        <div>
          <label className={labelClasses}>Deductions ({subcontractor.currency})</label>
          <input type="number" name="deductions" min={0} step="0.01" value={deductions} onChange={(e) => setDeductions(e.target.value)} className={`${inputClasses} mt-1`} />
        </div>
      </div>

      <p className="text-sm font-bold text-slate-900">Net Pay: {formatSubcontractorCurrency(netPay, subcontractor.currency)}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Status</label>
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value as SubcontractorPaymentStatus)} className={`${inputClasses} mt-1`}>
            {(["draft", "pending_approval", "approved", "paid"] as SubcontractorPaymentStatus[]).map((s) => (
              <option key={s} value={s}>
                {SUBCONTRACTOR_PAYMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        {status === "paid" && (
          <div>
            <label className={labelClasses}>Payment Date</label>
            <input type="date" name="payment_date" required defaultValue={payment?.payment_date ?? ""} className={`${inputClasses} mt-1`} />
          </div>
        )}
      </div>

      <div>
        <label className={labelClasses}>Notes / Reference</label>
        <textarea name="notes" rows={2} defaultValue={payment?.notes ?? ""} className={`${inputClasses} mt-1`} />
      </div>

      <button type="submit" className={buttonClasses}>
        {submitLabel}
      </button>
    </form>
  );
}

export default function GrowthSubcontractorPayrollSection({ subcontractors, payments, createPaymentAction, updatePaymentAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddId, setShowAddId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function runAction(fn: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        setError(result.error);
        return;
      }
      onDone?.();
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Subcontractors</h2>
        <p className="mt-1 text-sm text-slate-500">
          Separate from Employee/Agent Payroll above - no attendance rules, approved-paid-day calculations, or
          employee deductions apply. Manage profile, onboarding, agreement, training, and CRM access at{" "}
          <Link href="/admin/crm/subcontractors" className="font-semibold text-sky-600 hover:text-sky-700">
            Subcontractors
          </Link>
          .
        </p>
      </div>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-6 space-y-4">
        {subcontractors.length === 0 ? (
          <p className="text-sm text-slate-500">
            No subcontractors yet -{" "}
            <Link href="/admin/crm/subcontractors" className="font-semibold text-sky-600 hover:text-sky-700">
              add one
            </Link>{" "}
            to get started.
          </p>
        ) : (
          subcontractors.map((subcontractor) => {
            const subcontractorPayments = payments
              .filter((p) => p.subcontractor_id === subcontractor.id)
              .slice()
              .sort((a, b) => (a.period_start < b.period_start ? 1 : -1));

            return (
              <div key={subcontractor.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{subcontractor.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {subcontractor.country ?? "—"} · {formatSubcontractorCurrency(subcontractor.pay_rate, subcontractor.currency)}
                      {isQuantityBasedPayType(subcontractor.pay_type) ? " per unit" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === subcontractor.id ? null : subcontractor.id)}
                    className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                  >
                    {expandedId === subcontractor.id ? "Hide Payments" : "Manage Payments"}
                  </button>
                </div>

                {expandedId === subcontractor.id && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment History</p>
                      <button
                        type="button"
                        onClick={() => setShowAddId(showAddId === subcontractor.id ? null : subcontractor.id)}
                        disabled={isPending}
                        className={buttonClasses}
                      >
                        {showAddId === subcontractor.id ? "Cancel" : "+ New Payment"}
                      </button>
                    </div>

                    {showAddId === subcontractor.id && (
                      <PaymentForm
                        subcontractor={subcontractor}
                        onSubmit={(formData) => runAction(() => createPaymentAction(subcontractor.id, formData), () => setShowAddId(null))}
                        submitLabel="Save Payment"
                      />
                    )}

                    <div className="mt-3 space-y-2">
                      {subcontractorPayments.length === 0 ? (
                        <p className="text-xs text-slate-500">No payment history yet.</p>
                      ) : (
                        subcontractorPayments.map((payment) =>
                          editingId === payment.id ? (
                            <PaymentForm
                              key={payment.id}
                              subcontractor={subcontractor}
                              payment={payment}
                              onSubmit={(formData) => runAction(() => updatePaymentAction(payment.id, formData), () => setEditingId(null))}
                              submitLabel="Save Changes"
                            />
                          ) : (
                            <div key={payment.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium text-slate-800">
                                  {formatDateShort(payment.period_start)} - {formatDateShort(payment.period_end)}
                                  {payment.business_client_snapshot && ` · ${payment.business_client_snapshot}`}
                                </p>
                                <StatusBadge status={payment.status} />
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-4">
                                {payment.quantity !== null && (
                                  <div>
                                    <span className="block text-slate-400">Quantity</span>
                                    {payment.quantity}
                                  </div>
                                )}
                                <div>
                                  <span className="block text-slate-400">Gross Pay</span>
                                  {formatSubcontractorCurrency(payment.gross_pay, payment.currency_snapshot)}
                                </div>
                                <div>
                                  <span className="block text-slate-400">Adjustments</span>
                                  {formatSubcontractorCurrency(payment.adjustments, payment.currency_snapshot)}
                                </div>
                                <div>
                                  <span className="block text-slate-400">Deductions</span>-
                                  {formatSubcontractorCurrency(payment.deductions, payment.currency_snapshot)}
                                </div>
                                <div className="font-semibold text-slate-900">
                                  <span className="block font-normal text-slate-400">Net Pay</span>
                                  {formatSubcontractorCurrency(payment.net_pay, payment.currency_snapshot)}
                                </div>
                                {payment.payment_date && (
                                  <div>
                                    <span className="block text-slate-400">Paid On</span>
                                    {formatDateShort(payment.payment_date)}
                                  </div>
                                )}
                              </div>
                              {payment.notes && <p className="mt-2 text-slate-500">{payment.notes}</p>}
                              <button type="button" onClick={() => setEditingId(payment.id)} className="mt-2 text-xs font-semibold text-sky-600 hover:text-sky-700">
                                Edit
                              </button>
                            </div>
                          )
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
