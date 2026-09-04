"use client";

// Read-only "Holiday Pay" section for an agent's own Pay page, shared by
// both CRMs. Only ever renders rows already scoped to this one agent -
// the query that produces `assignments` is filtered server-side by
// holiday_pay_assignments_agent_select_own RLS (migration 0106) as well
// as an explicit .eq() in the page, so there is no path for one agent to
// see another agent's holiday pay through this component.

import { HOLIDAY_PAY_CURRENCY, HOLIDAY_PAYMENT_TYPE_LABELS, type HolidayPayAssignmentWithHoliday } from "@/lib/holiday-pay";
import { formatDateLong, formatNgn } from "@/lib/payroll";

type Props = {
  assignments: HolidayPayAssignmentWithHoliday[];
};

export default function HolidayPaySection({ assignments }: Props) {
  // A holiday the RLS/soft-delete has hidden (holidays comes back null
  // from the embedded join) is never shown - this agent has nothing
  // meaningful to see for it anymore.
  const visible = assignments.filter((a) => a.holidays !== null);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
      <h2 className="text-base font-bold text-[var(--color-ink-strong)]">Holiday Pay</h2>

      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">No holiday pay has been assigned to you yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((assignment) => {
            const holiday = assignment.holidays!;
            return (
              <div key={assignment.id} className="rounded-xl border border-[var(--color-border)] p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--color-ink-strong)]">{holiday.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{formatDateLong(holiday.holiday_date)}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      assignment.status === "assigned" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {assignment.status === "assigned" ? "Approved" : "Removed"}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-[var(--color-text-muted)]">Type</dt>
                    <dd className="font-medium text-[var(--color-ink)]">{HOLIDAY_PAYMENT_TYPE_LABELS[holiday.payment_type]}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-muted)]">Amount</dt>
                    <dd className="font-medium text-[var(--color-ink)]">
                      {formatNgn(assignment.effective_amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-muted)]">Currency</dt>
                    <dd className="font-medium text-[var(--color-ink)]">{HOLIDAY_PAY_CURRENCY}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-muted)]">Payroll Period</dt>
                    <dd className="font-medium text-[var(--color-ink)]">
                      {holiday.payroll_period_payday ? formatDateLong(holiday.payroll_period_payday) : "Not yet scheduled"}
                    </dd>
                  </div>
                </dl>
                {assignment.override_reason && (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    <span className="font-semibold text-[var(--color-ink)]">Note: </span>
                    {assignment.override_reason}
                  </p>
                )}
                {!assignment.override_reason && holiday.eligibility_notes && (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    <span className="font-semibold text-[var(--color-ink)]">Note: </span>
                    {holiday.eligibility_notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
