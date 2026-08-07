import { formatDateLong, formatDateShort, formatNgn, formatPayPeriodLabel, type PayrollRecord } from "@/lib/payroll";

type Props = {
  nextPayday: string;
  /** Already scoped to just this agent and ordered by payday desc (most recent/upcoming first). */
  records: PayrollRecord[];
};

function StatusBadge({ status }: { status: PayrollRecord["status"] }) {
  const classes =
    status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {status === "paid" ? "Paid" : "Pending"}
    </span>
  );
}

export default function MyPayView({ nextPayday, records }: Props) {
  const current = records[0] ?? null;
  const history = records.slice(1);
  const nextPaydayStatus = current?.payday === nextPayday ? current.status : "pending";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Next Payday
        </p>
        <p className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">
          {formatDateLong(nextPayday)}
        </p>
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
                <dt className="text-xs text-[var(--color-text-muted)]">Base Salary</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatNgn(current.base_salary)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Internet Allowance</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatNgn(current.internet_allowance)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Bonus/Commission</dt>
                <dd className="font-medium text-[var(--color-ink)]">{formatNgn(current.bonus_commission)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Deductions</dt>
                <dd className="font-medium text-[var(--color-ink)]">-{formatNgn(current.deductions)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-bold text-[var(--color-ink-strong)]">
                Total Expected Pay: {formatNgn(current.total_pay)}
              </p>
              <StatusBadge status={current.status} />
            </div>
            {current.status === "paid" && current.actual_payment_date && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Paid on {formatDateShort(current.actual_payment_date)}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            No payroll record yet for the current period. Contact your admin if you believe this is
            in error.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
        <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Payment History</h2>

        {history.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">No payment history yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                  <th className="pb-2 pr-4 font-medium">Pay Period</th>
                  <th className="pb-2 pr-4 font-medium">Payday</th>
                  <th className="pb-2 pr-4 font-medium">Total Paid</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2.5 pr-4 text-[var(--color-ink)]">
                      {formatPayPeriodLabel(record.pay_period_start, record.pay_period_end)}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--color-ink)]">
                      {record.actual_payment_date
                        ? formatDateShort(record.actual_payment_date)
                        : formatDateShort(record.payday)}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-[var(--color-ink)]">
                      {formatNgn(record.total_pay)}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge status={record.status} />
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
