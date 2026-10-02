"use client";

import { useState } from "react";
import PayrollStatementDialog from "./PayrollStatementDialog";
import type { AgentPayrollRecord } from "@/lib/shared-payroll";

import {
  formatCurrency,
  formatDateLong,
  formatDateShort,
  formatPayPeriodLabel,
  hourlyRate,
  PAYROLL_STATUS_LABELS,
  type PayrollCurrency,
  type PayrollStatus,
} from "@/lib/payroll";
import { buildPayStatementHtml, openPayStatementWindow } from "@/lib/pay-statement";

type Props = {
  companyName: string;
  crmLabel: string;
  agentName: string;
  nextPayday: string;
  /** Already scoped to just this agent and ordered by payday desc (most recent/upcoming first). */
  records: AgentPayrollRecord[];
  // This agent's own Payroll Currency - every amount below is formatted in
  // it, never a fixed currency (see migration 0134).
  currency: PayrollCurrency;
};

const STATUS_BADGE_CLASSES: Record<PayrollStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};

function StatusBadge({ status }: { status: PayrollStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE_CLASSES[status]}`}>
      {PAYROLL_STATUS_LABELS[status]}
    </span>
  );
}

export default function MyPayView({ companyName, crmLabel, agentName, nextPayday, records, currency }: Props) {
  // Agents only ever see Draft/Approved/Paid records that are actually
  // theirs to review here - a Cancelled pay period was voided and never
  // paid out, so it's left out of "my pay" entirely rather than showing
  // a confusing ₦0 line.
  const visible = records.filter((r) => r.status !== "cancelled");
  const current = visible[0] ?? null;
  const history = visible.slice(1);
  const [selected, setSelected] = useState<AgentPayrollRecord | null>(null);

  function printStatement(record: AgentPayrollRecord) {
    const html = buildPayStatementHtml({
      companyName,
      crmLabel,
      agentName,
      currency: record.payroll_currency ?? currency,
      payPeriodStart: record.pay_period_start,
      payPeriodEnd: record.pay_period_end,
      payday: record.payday,
      standardWorkingDays: record.standard_working_days,
      standardBiweeklyWage: record.standard_biweekly_wage,
      standardPaidHours: record.standard_paid_hours,
      daysPresent: record.days_present,
      unpaidAbsenceDays: record.unpaid_absence_days,
      regularPaidHours: record.regular_paid_hours,
      unpaidHours: record.unpaid_hours,
      approvedPaidLeaveHours: record.approved_paid_leave_hours,
      basePayEarned: record.base_pay_earned,
      incentiveBonus: record.bonus_commission,
      otherAdditions: record.other_additions,
      holidayPay: record.holiday_pay,
      internetAllowance: record.internet_allowance,
      deductions: record.deductions,
      totalPay: record.total_pay,
      status: record.status,
      actualPaymentDate: record.actual_payment_date,
      paymentMethod: record.payment_method,
      agentNote: record.admin_notes,
      recordId: record.id,
    });
    openPayStatementWindow(html);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-[var(--color-input-bg)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-900">Current / Latest Pay</h2><span className="text-xs text-slate-500">Next payday: {formatDateLong(nextPayday)}</span></div>
        {current ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm text-slate-700">{formatPayPeriodLabel(current.pay_period_start, current.pay_period_end)}</p><p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatCurrency(current.total_pay, current.payroll_currency ?? currency)}</p><p className="mt-1 text-xs text-slate-500">{current.actual_payment_date ? `Paid on ${formatDateShort(current.actual_payment_date)}` : `Scheduled payday: ${formatDateShort(current.payday)}`}{current.payment_method ? ` · ${current.payment_method}` : ""}</p></div>
          <div className="flex flex-wrap items-center gap-3"><StatusBadge status={current.status} /><button type="button" onClick={() => setSelected(current)} className="text-xs font-semibold text-sky-700">View Statement</button><button type="button" onClick={() => printStatement(current)} className="text-xs font-semibold text-slate-600">Print / Download Statement</button></div>
        </div> : <p className="mt-3 text-sm text-slate-500">No payroll record yet. Contact your admin if you believe this is in error.</p>}
      </section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-[var(--color-input-bg)]">
        <h2 className="px-4 py-3 text-sm font-semibold text-slate-900">Pay History</h2>
        {history.length ? <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Pay history, scroll horizontally for statement actions"><table className="w-full min-w-[650px] text-left text-xs">
          <thead className="border-y border-slate-200 bg-slate-50 text-slate-500"><tr>{["Pay Period", "Payment Date", "Final Amount", "Status", "Statement"].map(label => <th key={label} scope="col" className="px-4 py-2 font-semibold">{label}</th>)}</tr></thead>
          <tbody>{history.map(record => <tr key={record.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <th scope="row" className="px-4 py-2 text-left font-medium">{formatPayPeriodLabel(record.pay_period_start, record.pay_period_end)}</th>
            <td className="px-4 py-2">{record.actual_payment_date ? formatDateShort(record.actual_payment_date) : "—"}</td>
            <td className="px-4 py-2 font-semibold tabular-nums">{formatCurrency(record.total_pay, record.payroll_currency ?? currency)}</td>
            <td className="px-4 py-2"><StatusBadge status={record.status} /></td>
            <td className="px-4 py-2"><div className="flex gap-3 whitespace-nowrap"><button type="button" onClick={() => setSelected(record)} className="font-semibold text-sky-700">View Statement</button><button type="button" onClick={() => printStatement(record)} className="font-semibold text-slate-600">Print / Download</button></div></td>
          </tr>)}</tbody>
        </table></div> : <p className="px-4 pb-4 text-sm text-slate-500">No earlier payroll records.</p>}
      </section>
      {selected && <PayrollStatementDialog title={`${agentName} · Payroll Statement`} onClose={() => setSelected(null)}>
        <p className="text-xs text-slate-500">{companyName} · {formatPayPeriodLabel(selected.pay_period_start, selected.pay_period_end)} · Payday {formatDateShort(selected.payday)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Scheduled Days / Hours</dt>
                <dd className="font-medium text-[var(--color-ink)]">
                  {selected.standard_working_days}d / {selected.standard_paid_hours}h
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Days Present</dt>
                <dd className="font-medium text-[var(--color-ink)]">{selected.days_present}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Missed Days</dt>
                <dd className="font-medium text-[var(--color-ink)]">{selected.unpaid_absence_days}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Approved Paid-Leave Hours</dt>
                <dd className="font-medium text-[var(--color-ink)]">{selected.approved_paid_leave_hours}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Regular Paid Hours</dt>
                <dd className="font-medium text-[var(--color-ink)]">{selected.regular_paid_hours}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Unpaid Hours</dt>
                <dd className="font-medium text-[var(--color-ink)]">{selected.unpaid_hours}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Hourly Wage</dt>
                <dd className="font-medium text-[var(--color-ink)]">
                  {formatCurrency(hourlyRate(selected.standard_biweekly_wage, selected.standard_paid_hours), selected.payroll_currency ?? currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Gross Wage Earnings</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatCurrency(selected.base_pay_earned, selected.payroll_currency ?? currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Attendance Deductions</dt>
                <dd className="font-medium text-[var(--color-ink)]">-{formatCurrency(selected.deductions, selected.payroll_currency ?? currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Internet Allowance</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatCurrency(selected.internet_allowance, selected.payroll_currency ?? currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Incentive / Bonus</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatCurrency(selected.bonus_commission, selected.payroll_currency ?? currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Other Additions</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatCurrency(selected.other_additions, selected.payroll_currency ?? currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Holiday Pay</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatCurrency(selected.holiday_pay, selected.payroll_currency ?? currency)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-bold text-[var(--color-ink-strong)]">
                Final Amount: {formatCurrency(selected.total_pay, selected.payroll_currency ?? currency)}
              </p>
              <StatusBadge status={selected.status} />
            </div>
            {selected.status === "paid" && selected.actual_payment_date && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Paid on {formatDateShort(selected.actual_payment_date)}
                {selected.payment_method ? ` via ${selected.payment_method}` : ""}
              </p>
            )}
            {selected.admin_notes && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
                <span className="font-semibold text-[var(--color-ink)]">Notes for agent: </span>
                {selected.admin_notes}
              </p>
            )}

        <button type="button" onClick={() => printStatement(selected)} className="mt-4 text-xs font-semibold text-sky-700">Print / Download Statement</button>
      </PayrollStatementDialog>}
    </div>
  );
}
