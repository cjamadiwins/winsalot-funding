"use client";

import {
  dailyRate,
  formatDateLong,
  formatDateShort,
  formatNgn,
  formatPayPeriodLabel,
  PAYROLL_STATUS_LABELS,
  type PayrollRecord,
  type PayrollStatus,
} from "@/lib/payroll";
import { buildPayStatementHtml, openPayStatementWindow } from "@/lib/pay-statement";

type Props = {
  companyName: string;
  crmLabel: string;
  agentName: string;
  nextPayday: string;
  /** Already scoped to just this agent and ordered by payday desc (most recent/upcoming first). */
  records: PayrollRecord[];
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

export default function MyPayView({ companyName, crmLabel, agentName, nextPayday, records }: Props) {
  // Agents only ever see Draft/Approved/Paid records that are actually
  // theirs to review here - a Cancelled pay period was voided and never
  // paid out, so it's left out of "my pay" entirely rather than showing
  // a confusing ₦0 line.
  const visible = records.filter((r) => r.status !== "cancelled");
  const current = visible[0] ?? null;
  const history = visible.slice(1);
  const nextPaydayStatus = current?.payday === nextPayday ? current.status : "draft";

  function printStatement(record: PayrollRecord) {
    const html = buildPayStatementHtml({
      companyName,
      crmLabel,
      agentName,
      payPeriodStart: record.pay_period_start,
      payPeriodEnd: record.pay_period_end,
      payday: record.payday,
      standardBiweeklyPay: record.standard_biweekly_pay,
      standardWorkingDays: record.standard_working_days,
      daysPresent: record.days_present,
      approvedPaidDays: record.approved_paid_days,
      unpaidAbsenceDays: record.unpaid_absence_days,
      totalPayableDays: record.total_payable_days,
      basePayEarned: record.base_pay_earned,
      incentiveBonus: record.bonus_commission,
      otherAdditions: record.other_additions,
      internetAllowance: record.internet_allowance,
      deductions: record.deductions,
      totalPay: record.total_pay,
      status: record.status,
      actualPaymentDate: record.actual_payment_date,
      paymentMethod: record.payment_method,
    });
    openPayStatementWindow(html);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Next Payday</p>
        <p className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">{formatDateLong(nextPayday)}</p>
        <div className="mt-2">
          <StatusBadge status={nextPaydayStatus} />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Current Pay</h2>

        {current ? (
          <>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              {formatPayPeriodLabel(current.pay_period_start, current.pay_period_end)}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Standard Biweekly Pay</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatNgn(current.standard_biweekly_pay)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Daily Rate</dt>
                <dd className="font-medium text-[var(--color-ink)]">
                  {formatNgn(dailyRate(current.standard_biweekly_pay, current.standard_working_days))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Days Present</dt>
                <dd className="font-medium text-[var(--color-ink)]">{current.days_present}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Approved Paid Days</dt>
                <dd className="font-medium text-[var(--color-ink)]">{current.approved_paid_days}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Unpaid Absence Days</dt>
                <dd className="font-medium text-[var(--color-ink)]">{current.unpaid_absence_days}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Total Payable Days</dt>
                <dd className="font-medium text-[var(--color-ink)]">{current.total_payable_days}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Base Pay Earned</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatNgn(current.base_pay_earned)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Incentive / Bonus</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatNgn(current.bonus_commission)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Other Additions</dt>
                <dd className="font-medium text-[var(--color-ink)]">
                  {formatNgn(current.other_additions + current.internet_allowance)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Deductions</dt>
                <dd className="font-medium text-[var(--color-ink)]">-{formatNgn(current.deductions)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-bold text-[var(--color-ink-strong)]">
                Final Amount: {formatNgn(current.total_pay)}
              </p>
              <StatusBadge status={current.status} />
            </div>
            {current.status === "paid" && current.actual_payment_date && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Paid on {formatDateShort(current.actual_payment_date)}
                {current.payment_method ? ` via ${current.payment_method}` : ""}
              </p>
            )}
            {current.admin_notes && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
                <span className="font-semibold text-[var(--color-ink)]">Notes from admin: </span>
                {current.admin_notes}
              </p>
            )}
            <button
              type="button"
              onClick={() => printStatement(current)}
              className="mt-4 text-xs font-semibold text-sky-600 hover:text-sky-700"
            >
              Print / Download Pay Statement
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            No payroll record yet for the current period. Contact your admin if you believe this is in error.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Payment History</h2>

        {history.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">No payment history yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                  <th className="pb-2 pr-4 font-medium">Pay Period</th>
                  <th className="pb-2 pr-4 font-medium">Payday</th>
                  <th className="pb-2 pr-4 font-medium">Payable Days</th>
                  <th className="pb-2 pr-4 font-medium">Total Paid</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Statement</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2.5 pr-4 text-[var(--color-ink)]">
                      {formatPayPeriodLabel(record.pay_period_start, record.pay_period_end)}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--color-ink)]">
                      {record.actual_payment_date ? formatDateShort(record.actual_payment_date) : formatDateShort(record.payday)}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--color-ink)]">{record.total_payable_days}</td>
                    <td className="py-2.5 pr-4 font-medium text-[var(--color-ink)]">{formatNgn(record.total_pay)}</td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => printStatement(record)}
                        className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                      >
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
