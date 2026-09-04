"use client";

// Admin "Subcontractors" section, shared by both CRMs' payroll pages.
// Entirely separate from AdminPayrollClient (employee/agent payroll) and
// HolidayPayAdminSection - subcontractors are not crm_users/leadgen_users,
// have no attendance/approved-paid-day/approved-leave rules, and their
// payments never mix into crm_payroll/leadgen_payroll. The subcontractor
// list and payment rows this receives are already scoped to the one CRM
// whose payroll page rendered it (crm_subcontractors vs
// leadgen_subcontractors - see supabase/migrations/0135).

import { useState, useTransition } from "react";
import {
  calculateSubcontractorGrossPay,
  calculateSubcontractorNetPay,
  formatSubcontractorCurrency,
  isQuantityBasedPayType,
  SUBCONTRACTOR_CURRENCIES,
  SUBCONTRACTOR_CURRENCY_LABELS,
  SUBCONTRACTOR_PAY_TYPES,
  SUBCONTRACTOR_PAY_TYPE_LABELS,
  SUBCONTRACTOR_PAYMENT_STATUS_LABELS,
  SUBCONTRACTOR_QUANTITY_LABELS,
  type SubcontractorBusinessClientOption,
  type SubcontractorPaymentRow,
  type SubcontractorPaymentStatus,
  type SubcontractorRow,
} from "@/lib/subcontractor-payroll";
import { formatDateShort } from "@/lib/payroll";

type ActionResult = { error?: string };

type Props = {
  crmLabel: string;
  subcontractors: SubcontractorRow[];
  payments: SubcontractorPaymentRow[];
  businessClients: SubcontractorBusinessClientOption[];
  createSubcontractorAction: (formData: FormData) => Promise<ActionResult>;
  updateSubcontractorAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  deactivateSubcontractorAction: (subcontractorId: string) => Promise<ActionResult>;
  reactivateSubcontractorAction: (subcontractorId: string) => Promise<ActionResult>;
  createSubcontractorPaymentAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  updateSubcontractorPaymentAction: (paymentId: string, formData: FormData) => Promise<ActionResult>;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-slate-500";

const STATUS_BADGE_CLASSES: Record<SubcontractorPaymentStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  approved: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
};

function StatusBadge({ status }: { status: SubcontractorPaymentStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE_CLASSES[status]}`}>
      {SUBCONTRACTOR_PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

function SubcontractorForm({
  subcontractor,
  businessClients,
  onSubmit,
  submitLabel,
}: {
  subcontractor?: SubcontractorRow;
  businessClients: SubcontractorBusinessClientOption[];
  onSubmit: (formData: FormData) => void;
  submitLabel: string;
}) {
  return (
    <form action={onSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Full Name</label>
          <input type="text" name="full_name" required defaultValue={subcontractor?.full_name} className={`${inputClasses} mt-1`} />
        </div>
        <div>
          <label className={labelClasses}>Business / Client (optional)</label>
          <select name="business_client_id" defaultValue={subcontractor?.business_client_id ?? ""} className={`${inputClasses} mt-1`}>
            <option value="">Not linked to a specific client</option>
            {businessClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses}>Country</label>
          <input type="text" name="country" defaultValue={subcontractor?.country ?? ""} className={`${inputClasses} mt-1`} />
        </div>
        <div>
          <label className={labelClasses}>Currency</label>
          <select name="currency" required defaultValue={subcontractor?.currency ?? "USD"} className={`${inputClasses} mt-1`}>
            {SUBCONTRACTOR_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {SUBCONTRACTOR_CURRENCY_LABELS[currency]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses}>Pay Type</label>
          <select name="pay_type" required defaultValue={subcontractor?.pay_type ?? "fixed"} className={`${inputClasses} mt-1`}>
            {SUBCONTRACTOR_PAY_TYPES.map((type) => (
              <option key={type} value={type}>
                {SUBCONTRACTOR_PAY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses}>Pay Rate / Fixed Amount</label>
          <input
            type="number"
            name="pay_rate"
            min={0}
            step="0.01"
            required
            defaultValue={subcontractor?.pay_rate ?? 0}
            className={`${inputClasses} mt-1`}
          />
          <p className="mt-1 text-[11px] font-normal normal-case text-slate-400">
            Per hour/day/lead for quantity-based pay types, or the usual flat amount per period otherwise. Each payment
            can still be entered individually.
          </p>
        </div>
      </div>

      <div>
        <label className={labelClasses}>Notes</label>
        <textarea name="notes" rows={2} defaultValue={subcontractor?.notes ?? ""} className={`${inputClasses} mt-1`} />
      </div>

      <button type="submit" className={buttonClasses}>
        {submitLabel}
      </button>
    </form>
  );
}

function PaymentForm({
  subcontractor,
  payment,
  onSubmit,
  submitLabel,
}: {
  subcontractor: SubcontractorRow;
  payment?: SubcontractorPaymentRow;
  onSubmit: (formData: FormData) => void;
  submitLabel: string;
}) {
  const quantityBased = isQuantityBasedPayType(subcontractor.pay_type);
  const [quantity, setQuantity] = useState(String(payment?.quantity ?? ""));
  const [grossPay, setGrossPay] = useState(String(payment?.gross_pay ?? subcontractor.pay_rate));
  const [adjustments, setAdjustments] = useState(String(payment?.adjustments ?? 0));
  const [deductions, setDeductions] = useState(String(payment?.deductions ?? 0));
  const [status, setStatus] = useState<SubcontractorPaymentStatus>(payment?.status ?? "pending");

  const effectiveGrossPay = quantityBased
    ? calculateSubcontractorGrossPay(subcontractor.pay_type, Number(quantity) || 0, subcontractor.pay_rate)
    : Number(grossPay) || 0;
  const netPay = calculateSubcontractorNetPay({
    grossPay: effectiveGrossPay,
    adjustments: Number(adjustments) || 0,
    deductions: Number(deductions) || 0,
  });

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
          <input
            type="number"
            name="quantity"
            min={0}
            step="0.01"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={`${inputClasses} mt-1`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Gross Pay = {SUBCONTRACTOR_QUANTITY_LABELS[subcontractor.pay_type]} x Rate ={" "}
            {formatSubcontractorCurrency(effectiveGrossPay, subcontractor.currency)}
          </p>
        </div>
      ) : (
        <div>
          <label className={labelClasses}>Gross Pay ({subcontractor.currency})</label>
          <input
            type="number"
            name="gross_pay"
            min={0}
            step="0.01"
            required
            value={grossPay}
            onChange={(e) => setGrossPay(e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Adjustments ({subcontractor.currency})</label>
          <input
            type="number"
            name="adjustments"
            min={0}
            step="0.01"
            value={adjustments}
            onChange={(e) => setAdjustments(e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Deductions ({subcontractor.currency})</label>
          <input
            type="number"
            name="deductions"
            min={0}
            step="0.01"
            value={deductions}
            onChange={(e) => setDeductions(e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
      </div>

      <p className="text-sm font-bold text-slate-900">Net Pay: {formatSubcontractorCurrency(netPay, subcontractor.currency)}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Status</label>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SubcontractorPaymentStatus)}
            className={`${inputClasses} mt-1`}
          >
            {(["pending", "approved", "paid"] as SubcontractorPaymentStatus[]).map((s) => (
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
        <label className={labelClasses}>Notes</label>
        <textarea name="notes" rows={2} defaultValue={payment?.notes ?? ""} className={`${inputClasses} mt-1`} />
      </div>

      <button type="submit" className={buttonClasses}>
        {submitLabel}
      </button>
    </form>
  );
}

function PaymentHistoryPanel({
  subcontractor,
  payments,
  createSubcontractorPaymentAction,
  updateSubcontractorPaymentAction,
}: {
  subcontractor: SubcontractorRow;
  payments: SubcontractorPaymentRow[];
  createSubcontractorPaymentAction: Props["createSubcontractorPaymentAction"];
  updateSubcontractorPaymentAction: Props["updateSubcontractorPaymentAction"];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const subcontractorPayments = payments
    .filter((p) => p.subcontractor_id === subcontractor.id)
    .slice()
    .sort((a, b) => (a.period_start < b.period_start ? 1 : -1));

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
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment History</p>
        <button type="button" onClick={() => setShowAdd((v) => !v)} disabled={isPending} className={buttonClasses}>
          {showAdd ? "Cancel" : "+ New Payment"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {showAdd && (
        <PaymentForm
          subcontractor={subcontractor}
          onSubmit={(formData) =>
            runAction(
              () => createSubcontractorPaymentAction(subcontractor.id, formData),
              () => setShowAdd(false)
            )
          }
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
                onSubmit={(formData) =>
                  runAction(
                    () => updateSubcontractorPaymentAction(payment.id, formData),
                    () => setEditingId(null)
                  )
                }
                submitLabel="Save Changes"
              />
            ) : (
              <div key={payment.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">
                    {formatDateShort(payment.period_start)} - {formatDateShort(payment.period_end)}
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
                    {formatSubcontractorCurrency(payment.gross_pay, subcontractor.currency)}
                  </div>
                  <div>
                    <span className="block text-slate-400">Adjustments</span>
                    {formatSubcontractorCurrency(payment.adjustments, subcontractor.currency)}
                  </div>
                  <div>
                    <span className="block text-slate-400">Deductions</span>
                    -{formatSubcontractorCurrency(payment.deductions, subcontractor.currency)}
                  </div>
                  <div className="font-semibold text-slate-900">
                    <span className="block font-normal text-slate-400">Net Pay</span>
                    {formatSubcontractorCurrency(payment.net_pay, subcontractor.currency)}
                  </div>
                  {payment.payment_date && (
                    <div>
                      <span className="block text-slate-400">Paid On</span>
                      {formatDateShort(payment.payment_date)}
                    </div>
                  )}
                </div>
                {payment.notes && <p className="mt-2 text-slate-500">{payment.notes}</p>}
                <button
                  type="button"
                  onClick={() => setEditingId(payment.id)}
                  className="mt-2 text-xs font-semibold text-sky-600 hover:text-sky-700"
                >
                  Edit
                </button>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

export default function SubcontractorsAdminSection({
  crmLabel,
  subcontractors,
  payments,
  businessClients,
  createSubcontractorAction,
  updateSubcontractorAction,
  deactivateSubcontractorAction,
  reactivateSubcontractorAction,
  createSubcontractorPaymentAction,
  updateSubcontractorPaymentAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const active = subcontractors.filter((s) => s.active);
  const inactive = subcontractors.filter((s) => !s.active);
  const businessClientsById = new Map(businessClients.map((c) => [c.id, c]));

  return (
    <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Subcontractors</h2>
          <p className="mt-1 text-sm text-slate-500">
            People paid outside {crmLabel}&apos;s regular employee/agent payroll - no attendance, no approved-paid-day
            rules, and their own currency, pay type, and payment history.
          </p>
        </div>
        <button type="button" onClick={() => setShowAdd((v) => !v)} className={buttonClasses}>
          {showAdd ? "Cancel" : "+ New Subcontractor"}
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showAdd && (
        <div className="mt-4">
          <SubcontractorForm
            businessClients={businessClients}
            onSubmit={(formData) => runAction(() => createSubcontractorAction(formData), () => setShowAdd(false))}
            submitLabel="Add Subcontractor"
          />
        </div>
      )}

      <div className="mt-6 space-y-4">
        {[...active, ...inactive].length === 0 ? (
          <p className="text-sm text-slate-500">No subcontractors yet.</p>
        ) : (
          [...active, ...inactive].map((subcontractor) => (
            <div key={subcontractor.id} className="rounded-2xl border border-slate-200 p-5">
              {editingId === subcontractor.id ? (
                <SubcontractorForm
                  subcontractor={subcontractor}
                  businessClients={businessClients}
                  onSubmit={(formData) =>
                    runAction(() => updateSubcontractorAction(subcontractor.id, formData), () => setEditingId(null))
                  }
                  submitLabel="Save Changes"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{subcontractor.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {subcontractor.business_client_id
                          ? businessClientsById.get(subcontractor.business_client_id)?.name ?? "Former client"
                          : "Not linked to a specific client"}
                        {subcontractor.country ? ` · ${subcontractor.country}` : ""} ·{" "}
                        {SUBCONTRACTOR_PAY_TYPE_LABELS[subcontractor.pay_type]} ·{" "}
                        {formatSubcontractorCurrency(subcontractor.pay_rate, subcontractor.currency)}
                        {isQuantityBasedPayType(subcontractor.pay_type) ? " per unit" : ""}
                      </p>
                      {subcontractor.notes && <p className="mt-1 text-xs italic text-slate-500">{subcontractor.notes}</p>}
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        subcontractor.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {subcontractor.active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
                    <button type="button" onClick={() => setEditingId(subcontractor.id)} className="text-sky-600 hover:text-sky-700">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === subcontractor.id ? null : subcontractor.id)}
                      className="text-sky-600 hover:text-sky-700"
                    >
                      {expandedId === subcontractor.id ? "Hide Payments" : "Manage Payments"}
                    </button>
                    {subcontractor.active ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => deactivateSubcontractorAction(subcontractor.id))}
                        className="text-amber-700 hover:text-amber-800"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => reactivateSubcontractorAction(subcontractor.id))}
                        className="text-emerald-700 hover:text-emerald-800"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>

                  {expandedId === subcontractor.id && (
                    <PaymentHistoryPanel
                      subcontractor={subcontractor}
                      payments={payments}
                      createSubcontractorPaymentAction={createSubcontractorPaymentAction}
                      updateSubcontractorPaymentAction={updateSubcontractorPaymentAction}
                    />
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
