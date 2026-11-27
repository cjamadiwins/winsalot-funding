"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SALES_BONUS_AGENT_STATUS_LABELS,
  SALES_BONUS_AGENT_STATUS_STYLES,
  SALES_BONUS_CLIENT_STATUS_LABELS,
  SALES_BONUS_CLIENT_STATUS_STYLES,
  SALES_BONUS_FUNDING_LABELS,
  formatBonusAmount,
  summarizeSalesBonuses,
  type SalesBonusAgentStatus,
  type SalesBonusRow,
} from "@/lib/sales-bonus";
import {
  approveSalesBonusAction,
  markSalesBonusPaidAction,
  recordSalesBonusClientPaymentAction,
  voidSalesBonusAction,
} from "@/lib/sales-bonus-actions";
import { formatDateShort } from "@/lib/payroll";

type Props = {
  rows: SalesBonusRow[];
  /** Paydays an approved bonus can be scheduled into; the first is the default. */
  paydays: string[];
  id?: string;
};

type Panel = { id: string; kind: "approve" | "pay" | "void" | "client" } | null;

const inputClass = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900";
const todayIso = () => new Date().toISOString().slice(0, 10);

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs opacity-80">{hint}</p>}
    </div>
  );
}

export default function SalesBonusAdminSection({ rows, paydays, id }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<SalesBonusAgentStatus | "all">("all");
  const [panel, setPanel] = useState<Panel>(null);
  const [payday, setPayday] = useState(paydays[0] ?? "");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; message?: string } | null>(null);

  const totals = useMemo(() => summarizeSalesBonuses(rows).CAD ?? { pending: 0, approved: 0, paid: 0, clientReceivableOutstanding: 0, clientReceived: 0, winsalotBonusExpense: 0 }, [rows]);
  const visible = rows.filter((r) => filter === "all" || r.agent_payment_status === filter);

  function open(next: Panel) {
    setFeedback(null);
    setReference("");
    setReason("");
    setConfirmed(false);
    setPaymentDate(todayIso());
    setPanel(panel && next && panel.id === next.id && panel.kind === next.kind ? null : next);
  }

  function run(action: () => Promise<{ error?: string; message?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result);
      if (!result.error) {
        setPanel(null);
        router.refresh();
      }
    });
  }

  return (
    <section id={id} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
      <h2 className="text-lg font-bold text-slate-900">Sales Conversion Bonuses</h2>
      <p className="mt-1 text-sm text-slate-500">
        CA$50 per appointment Admin confirms as a sale, credited to the booking agent and paid through Winsalot Corp payroll.
        Client payment and agent payment are tracked separately. A bonus is only ever marked paid when you confirm the payment was sent.
        These amounts are paid in CAD and do not change any salary record.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Pending approval" value={formatBonusAmount(totals.pending)} tone="border-amber-200 bg-amber-50 text-amber-900" />
        <Stat label="Approved, unpaid" value={formatBonusAmount(totals.approved)} tone="border-sky-200 bg-sky-50 text-sky-900" />
        <Stat label="Paid to agents" value={formatBonusAmount(totals.paid)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <Stat label="Client receivable (Teknokraft)" value={formatBonusAmount(totals.clientReceivableOutstanding)} hint={`${formatBonusAmount(totals.clientReceived)} received`} tone="border-indigo-200 bg-indigo-50 text-indigo-900" />
        <Stat label="Winsalot bonus expense (Hidebrandt)" value={formatBonusAmount(totals.winsalotBonusExpense)} hint="approved + paid" tone="border-slate-200 bg-slate-50 text-slate-900" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["all", "pending", "approved", "paid", "voided"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${filter === value ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-sky-400"}`}
          >
            {value === "all" ? "All" : SALES_BONUS_AGENT_STATUS_LABELS[value].split(" ")[0]}
          </button>
        ))}
      </div>

      {feedback?.error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{feedback.error}</p>}
      {feedback?.message && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{feedback.message}</p>}

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No sales conversion bonuses{filter === "all" ? " yet." : " with this status."}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 font-medium">Agent / sale</th>
                <th className="pb-2 pr-3 font-medium">Client &amp; funding</th>
                <th className="pb-2 pr-3 font-medium">Bonus</th>
                <th className="pb-2 pr-3 font-medium">Agent payment</th>
                <th className="pb-2 pr-3 font-medium">Client payment</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const active = panel?.id === row.id ? panel.kind : null;
                const canClient = row.client_payment_status === "receivable" && row.agent_payment_status !== "voided";
                return (
                  <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-900">{row.agent_name}</p>
                      <p className="text-slate-600">{row.business_name}</p>
                      <p className="text-xs text-slate-400">Confirmed {formatDateShort(row.sale_confirmed_at.slice(0, 10))} by {row.sale_confirmed_by_name}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="text-slate-900">{row.client_name}</p>
                      <p className="text-xs text-slate-500">{SALES_BONUS_FUNDING_LABELS[row.funding_model]}</p>
                    </td>
                    <td className="py-3 pr-3 font-semibold text-slate-900">{formatBonusAmount(row.bonus_amount, row.currency)}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SALES_BONUS_AGENT_STATUS_STYLES[row.agent_payment_status]}`}>
                        {SALES_BONUS_AGENT_STATUS_LABELS[row.agent_payment_status]}
                      </span>
                      {row.payroll_payday && row.agent_payment_status !== "voided" && <p className="mt-1 text-xs text-slate-500">Payroll {formatDateShort(row.payroll_payday)}</p>}
                      {row.agent_payment_status === "paid" && row.payment_date && (
                        <p className="mt-1 text-xs text-slate-500">Paid {formatDateShort(row.payment_date)} · {row.payment_reference}</p>
                      )}
                      {row.agent_payment_status === "voided" && row.void_reason && <p className="mt-1 text-xs text-slate-500">{row.void_reason}</p>}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SALES_BONUS_CLIENT_STATUS_STYLES[row.client_payment_status]}`}>
                        {SALES_BONUS_CLIENT_STATUS_LABELS[row.client_payment_status]}
                      </span>
                      {row.client_payment_status === "received" && row.client_payment_date && (
                        <p className="mt-1 text-xs text-slate-500">{formatDateShort(row.client_payment_date)}{row.client_payment_reference ? ` · ${row.client_payment_reference}` : ""}</p>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {row.agent_payment_status === "pending" && (
                          <button type="button" onClick={() => open({ id: row.id, kind: "approve" })} className="text-sm font-semibold text-sky-600 hover:text-sky-700">Approve</button>
                        )}
                        {row.agent_payment_status === "approved" && (
                          <button type="button" onClick={() => open({ id: row.id, kind: "pay" })} className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">Mark paid</button>
                        )}
                        {canClient && (
                          <button type="button" onClick={() => open({ id: row.id, kind: "client" })} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Client paid</button>
                        )}
                        {(row.agent_payment_status === "pending" || row.agent_payment_status === "approved") && (
                          <button type="button" onClick={() => open({ id: row.id, kind: "void" })} className="text-sm font-semibold text-rose-600 hover:text-rose-700">Void</button>
                        )}
                      </div>

                      {active === "approve" && (
                        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Pay with payroll on
                            <select value={payday} onChange={(e) => setPayday(e.target.value)} className={`${inputClass} mt-1 w-full`}>
                              {paydays.map((p) => <option key={p} value={p}>{formatDateShort(p)}</option>)}
                            </select>
                          </label>
                          <button type="button" disabled={isPending || !payday} onClick={() => run(() => approveSalesBonusAction(row.id, payday))} className="rounded-full bg-sky-600 px-3 py-1 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                            {isPending ? "Saving…" : "Approve bonus"}
                          </button>
                        </div>
                      )}
                      {active === "pay" && (
                        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Date payment was sent
                            <input type="date" value={paymentDate} max={todayIso()} onChange={(e) => setPaymentDate(e.target.value)} className={`${inputClass} mt-1 w-full`} />
                          </label>
                          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Payment reference (required)" className={inputClass} />
                          <label className="flex items-start gap-2 text-xs text-slate-700">
                            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
                            I confirm {row.agent_name} has actually been paid {formatBonusAmount(row.bonus_amount, row.currency)}.
                          </label>
                          <button type="button" disabled={isPending || !confirmed || !reference.trim()} onClick={() => run(() => markSalesBonusPaidAction(row.id, paymentDate, reference, confirmed))} className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                            {isPending ? "Saving…" : "Mark paid"}
                          </button>
                        </div>
                      )}
                      {active === "client" && (
                        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Date client payment received
                            <input type="date" value={paymentDate} max={todayIso()} onChange={(e) => setPaymentDate(e.target.value)} className={`${inputClass} mt-1 w-full`} />
                          </label>
                          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" className={inputClass} />
                          <button type="button" disabled={isPending} onClick={() => run(() => recordSalesBonusClientPaymentAction(row.id, paymentDate, reference))} className="rounded-full bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                            {isPending ? "Saving…" : "Record client payment"}
                          </button>
                        </div>
                      )}
                      {active === "void" && (
                        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2">
                          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className={inputClass} />
                          <button type="button" disabled={isPending || !reason.trim()} onClick={() => run(() => voidSalesBonusAction(row.id, reason))} className="rounded-full bg-rose-600 px-3 py-1 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                            {isPending ? "Saving…" : "Void bonus"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
