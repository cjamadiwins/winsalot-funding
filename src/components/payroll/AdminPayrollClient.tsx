"use client";

import { startTransition, useEffect, useMemo, useState, useTransition } from "react";
import {
  calculateBasePayEarned,
  calculateFinalPay,
  dailyRate,
  formatDateShort,
  formatNgn,
  formatPayPeriodLabel,
  getPayPeriodForPayday,
  PAYROLL_AUDIT_ACTION_LABELS,
  PAYROLL_STATUS_LABELS,
  STANDARD_BIWEEKLY_PAY,
  STANDARD_WORKING_DAYS,
  type PayrollAuditLogRow,
  type PayrollRecord,
  type PayrollStatus,
} from "@/lib/payroll";
import { buildPayStatementHtml, openPayStatementWindow } from "@/lib/pay-statement";

type Agent = { id: string; full_name: string; email: string };

type ActionResult = { error?: string };

// Structurally identical to (but deliberately not imported from) either
// CRM's own crm-attendance-report.ts / leadgen-attendance-report.ts
// PayPeriodAttendanceSummary - this component is shared by both CRMs and
// must never import from one CRM's attendance internals, matching this
// codebase's "these two CRMs' logic must never accidentally couple"
// convention. TypeScript's structural typing accepts either CRM's actual
// return value here since the shapes match exactly.
type AttendanceStatus = "Clocked In" | "Clocked Out" | "Incomplete" | "Admin Clock-Out";
type AttendanceSummary = {
  periodStart: string;
  periodEnd: string;
  days: { dateKey: string; isWeekday: boolean; status: AttendanceStatus | null; minutes: number }[];
  weekdayCount: number;
  daysPresent: number;
  flaggedDates: string[];
  openTodayDate: string | null;
};

type Props = {
  companyName: string;
  crmLabel: string;
  agents: Agent[];
  records: PayrollRecord[];
  auditLog: PayrollAuditLogRow[];
  nextPayday: string;
  upcomingPaydays: string[];
  loadAttendanceAction: (agentId: string, payday: string) => Promise<{ error?: string; summary?: AttendanceSummary }>;
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (recordId: string, formData: FormData) => Promise<ActionResult>;
  approveAction: (recordId: string, formData: FormData) => Promise<ActionResult>;
  markPaidAction: (recordId: string, formData: FormData) => Promise<ActionResult>;
  cancelAction: (recordId: string, formData: FormData) => Promise<ActionResult>;
  reopenAction: (recordId: string, formData: FormData) => Promise<ActionResult>;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-slate-500";

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

type FormValues = {
  daysPresent: string;
  approvedPaidDays: string;
  unpaidAbsenceDays: string;
  standardBiweeklyPay: string;
  standardWorkingDays: string;
  bonusCommission: string;
  otherAdditions: string;
  internetAllowance: string;
  deductions: string;
};

function defaultFormValues(record?: PayrollRecord): FormValues {
  return {
    daysPresent: String(record?.days_present ?? 0),
    approvedPaidDays: String(record?.approved_paid_days ?? 0),
    unpaidAbsenceDays: String(record?.unpaid_absence_days ?? 0),
    standardBiweeklyPay: String(record?.standard_biweekly_pay ?? STANDARD_BIWEEKLY_PAY),
    standardWorkingDays: String(record?.standard_working_days ?? STANDARD_WORKING_DAYS),
    bonusCommission: String(record?.bonus_commission ?? 0),
    otherAdditions: String(record?.other_additions ?? 0),
    internetAllowance: String(record?.internet_allowance ?? 0),
    deductions: String(record?.deductions ?? 0),
  };
}

function PayrollFormFields({
  agents,
  defaultAgentId,
  defaultPayday,
  record,
  lockAgent,
  requireConfirmApprovedEdit,
  loadAttendanceAction,
}: {
  agents: Agent[];
  defaultAgentId?: string;
  defaultPayday: string;
  record?: PayrollRecord;
  lockAgent?: boolean;
  requireConfirmApprovedEdit?: boolean;
  loadAttendanceAction: Props["loadAttendanceAction"];
}) {
  const [agentId, setAgentId] = useState(defaultAgentId ?? "");
  const [payday, setPayday] = useState(defaultPayday);
  const [values, setValues] = useState<FormValues>(defaultFormValues(record));
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [confirmApprovedEdit, setConfirmApprovedEdit] = useState(false);

  const period = payday ? getPayPeriodForPayday(payday) : null;

  function setField<K extends keyof FormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleLoadAttendance() {
    if (!agentId || !payday) return;
    setLoadingAttendance(true);
    setAttendanceError(null);
    try {
      const result = await loadAttendanceAction(agentId, payday);
      if (result.error || !result.summary) {
        setAttendanceError(result.error ?? "Failed to load attendance.");
        return;
      }
      setAttendance(result.summary);
      setField("daysPresent", String(result.summary.daysPresent));
      setField("standardWorkingDays", String(result.summary.weekdayCount || STANDARD_WORKING_DAYS));
      setValues((v) => {
        const approved = Number(v.approvedPaidDays) || 0;
        const suggestedAbsence = Math.max(result.summary!.weekdayCount - result.summary!.daysPresent - approved, 0);
        return { ...v, unpaidAbsenceDays: String(suggestedAbsence) };
      });
    } finally {
      setLoadingAttendance(false);
    }
  }

  // Auto-load attendance as soon as an agent + payday are both picked, so
  // the admin never has to remember to click "Load Attendance" - it stays
  // around only as a manual refresh. Re-fires whenever the agent or the
  // pay period (payday) changes; approved-paid-days edits are read from
  // the latest state inside handleLoadAttendance itself, so they don't
  // need to be a dependency here.
  useEffect(() => {
    if (!agentId || !payday) return;
    startTransition(() => {
      handleLoadAttendance();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, payday]);

  const daysPresent = Number(values.daysPresent) || 0;
  const approvedPaidDays = Number(values.approvedPaidDays) || 0;
  const standardBiweeklyPay = Number(values.standardBiweeklyPay) || 0;
  const standardWorkingDays = Number(values.standardWorkingDays) || 0;
  const totalPayableDays = daysPresent + approvedPaidDays;
  const rate = dailyRate(standardBiweeklyPay, standardWorkingDays);
  const basePayEarned = calculateBasePayEarned(totalPayableDays, standardBiweeklyPay, standardWorkingDays);
  const finalPay = calculateFinalPay({
    basePayEarned,
    internetAllowance: Number(values.internetAllowance) || 0,
    incentiveBonus: Number(values.bonusCommission) || 0,
    otherAdditions: Number(values.otherAdditions) || 0,
    deductions: Number(values.deductions) || 0,
  });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Agent</label>
          <select
            name="agent_id"
            required
            value={agentId}
            disabled={lockAgent}
            onChange={(e) => setAgentId(e.target.value)}
            className={`${inputClasses} mt-1`}
          >
            <option value="" disabled>
              Select an agent
            </option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.full_name} ({agent.email})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClasses}>Payday</label>
          <input
            type="date"
            name="payday"
            required
            value={payday}
            onChange={(e) => setPayday(e.target.value)}
            className={`${inputClasses} mt-1`}
          />
          {period && (
            <p className="mt-1 text-xs text-slate-500">Pay period: {formatPayPeriodLabel(period.start, period.end)}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance</p>
          <button
            type="button"
            onClick={handleLoadAttendance}
            disabled={!agentId || !payday || loadingAttendance}
            className="rounded-full border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingAttendance ? "Loading..." : "Refresh Attendance"}
          </button>
        </div>
        {attendanceError && <p className="mt-2 text-xs text-rose-600">{attendanceError}</p>}
        {attendance && (
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            <p>
              {attendance.weekdayCount} standard working days in this period, {attendance.daysPresent} with a
              completed clock-in/clock-out.
            </p>
            {attendance.flaggedDates.length > 0 && (
              <p className="text-amber-700">
                ⚠ Clock-in with no clock-out on: {attendance.flaggedDates.map((d) => formatDateShort(d)).join(", ")} -
                review before finalizing.
              </p>
            )}
            {attendance.openTodayDate && <p>Agent is currently clocked in today.</p>}
            <p>Fields below were pre-filled from this - review and adjust before saving.</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClasses}>Days Present</label>
          <input
            type="number"
            name="days_present"
            min={0}
            step={1}
            required
            value={values.daysPresent}
            onChange={(e) => setField("daysPresent", e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Approved Paid Days</label>
          <input
            type="number"
            name="approved_paid_days"
            min={0}
            step={1}
            required
            value={values.approvedPaidDays}
            onChange={(e) => setField("approvedPaidDays", e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Unpaid Absence Days</label>
          <input
            type="number"
            name="unpaid_absence_days"
            min={0}
            step={1}
            required
            value={values.unpaidAbsenceDays}
            onChange={(e) => setField("unpaidAbsenceDays", e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
      </div>

      <p className="text-sm text-slate-600">
        Total Payable Days: <span className="font-semibold text-slate-900">{totalPayableDays}</span> · Daily Rate:{" "}
        <span className="font-semibold text-slate-900">{formatNgn(rate)}</span> · Base Pay Earned:{" "}
        <span className="font-semibold text-slate-900">{formatNgn(basePayEarned)}</span>
      </p>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pay structure (advanced)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClasses}>Standard Biweekly Pay (₦)</label>
            <input
              type="number"
              name="standard_biweekly_pay"
              min={0}
              step="0.01"
              value={values.standardBiweeklyPay}
              onChange={(e) => setField("standardBiweeklyPay", e.target.value)}
              className={`${inputClasses} mt-1`}
            />
          </div>
          <div>
            <label className={labelClasses}>Standard Working Days</label>
            <input
              type="number"
              name="standard_working_days"
              min={1}
              step={1}
              value={values.standardWorkingDays}
              onChange={(e) => setField("standardWorkingDays", e.target.value)}
              className={`${inputClasses} mt-1`}
            />
          </div>
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Incentive / Bonus Earned (₦)</label>
          <input
            type="number"
            name="bonus_commission"
            min={0}
            step="0.01"
            value={values.bonusCommission}
            onChange={(e) => setField("bonusCommission", e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Other Additions (₦)</label>
          <input
            type="number"
            name="other_additions"
            min={0}
            step="0.01"
            value={values.otherAdditions}
            onChange={(e) => setField("otherAdditions", e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Internet Allowance (₦, legacy)</label>
          <input
            type="number"
            name="internet_allowance"
            min={0}
            step="0.01"
            value={values.internetAllowance}
            onChange={(e) => setField("internetAllowance", e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Deductions (₦)</label>
          <input
            type="number"
            name="deductions"
            min={0}
            step="0.01"
            value={values.deductions}
            onChange={(e) => setField("deductions", e.target.value)}
            className={`${inputClasses} mt-1`}
          />
        </div>
      </div>

      <p className="text-base font-bold text-slate-900">Final Amount Payable: {formatNgn(finalPay)}</p>

      <div>
        <label className={labelClasses}>Admin Notes (visible to the agent)</label>
        <textarea
          name="admin_notes"
          rows={2}
          defaultValue={record?.admin_notes ?? ""}
          className={`${inputClasses} mt-1`}
        />
      </div>

      <div>
        <label className={labelClasses}>Reason for this entry / adjustment (internal, required)</label>
        <textarea name="adjustment_reason" rows={2} required className={`${inputClasses} mt-1`} />
      </div>

      {requireConfirmApprovedEdit && (
        <label className="flex items-center gap-2 text-xs font-medium text-amber-800">
          <input
            type="checkbox"
            checked={confirmApprovedEdit}
            onChange={(e) => setConfirmApprovedEdit(e.target.checked)}
          />
          I understand this record is already Approved and confirm this change.
          <input type="hidden" name="confirm_approved_edit" value={confirmApprovedEdit ? "true" : "false"} />
        </label>
      )}
    </>
  );
}

function AuditLogPanel({ entries }: { entries: PayrollAuditLogRow[] }) {
  if (entries.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">No audit history yet.</p>;
  }
  return (
    <ul className="mt-2 space-y-2 text-xs text-slate-600">
      {entries
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .map((entry) => (
          <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="font-semibold text-slate-800">
              {PAYROLL_AUDIT_ACTION_LABELS[entry.action]}{" "}
              <span className="font-normal text-slate-400">
                · {entry.performed_by_name} · {new Date(entry.created_at).toLocaleString()}
              </span>
            </p>
            {entry.reason && <p className="mt-1">Reason: {entry.reason}</p>}
          </li>
        ))}
    </ul>
  );
}

function PaymentMethodSelect() {
  return (
    <select name="payment_method" required className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900">
      <option value="">Payment method</option>
      <option value="Bank Transfer">Bank Transfer</option>
      <option value="Mobile Money">Mobile Money</option>
      <option value="Cash">Cash</option>
      <option value="Other">Other</option>
    </select>
  );
}

export default function AdminPayrollClient({
  companyName,
  crmLabel,
  agents,
  records,
  auditLog,
  nextPayday,
  upcomingPaydays,
  loadAttendanceAction,
  createAction,
  updateAction,
  approveAction,
  markPaidAction,
  cancelAction,
  reopenAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [reopenConfirmed, setReopenConfirmed] = useState(false);
  const [auditOpenId, setAuditOpenId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");

  function runAction(fn: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result?.error) {
          setError(result.error);
          return;
        }
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const agentsById = new Map(agents.map((a) => [a.id, a]));
  const periods = useMemo(
    () => Array.from(new Set(records.map((r) => r.payday))).sort((a, b) => (a < b ? 1 : -1)),
    [records]
  );

  const visibleRecords = records.filter((r) => {
    if (agentFilter !== "all" && r.agent_id !== agentFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (periodFilter !== "all" && r.payday !== periodFilter) return false;
    return true;
  });

  const groups = new Map<string, PayrollRecord[]>();
  for (const record of visibleRecords) {
    const list = groups.get(record.agent_id) ?? [];
    list.push(record);
    groups.set(record.agent_id, list);
  }
  const orderedAgentIds = Array.from(groups.keys()).sort((a, b) => {
    const nameA = agentsById.get(a)?.full_name ?? "";
    const nameB = agentsById.get(b)?.full_name ?? "";
    return nameA.localeCompare(nameB);
  });

  function printStatement(record: PayrollRecord) {
    const agent = agentsById.get(record.agent_id);
    const html = buildPayStatementHtml({
      companyName,
      crmLabel,
      agentName: agent?.full_name ?? "Former agent",
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
    <div>
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Next Payday</p>
        <p className="mt-1 text-lg font-bold text-sky-900">{formatDateShort(nextPayday)}</p>
        <p className="mt-1 text-xs text-sky-700">
          Upcoming: {upcomingPaydays.map((d) => formatDateShort(d)).join(" · ")}
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setShowAdd((v) => !v)} className={buttonClasses}>
          {showAdd ? "Cancel" : "+ New Payroll Record"}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="all">All agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.full_name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="all">All statuses</option>
            {(Object.keys(PAYROLL_STATUS_LABELS) as PayrollStatus[]).map((status) => (
              <option key={status} value={status}>
                {PAYROLL_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="all">All pay periods</option>
            {periods.map((payday) => (
              <option key={payday} value={payday}>
                {formatDateShort(payday)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showAdd && (
        <form
          action={(formData) =>
            runAction(
              () => createAction(formData),
              () => setShowAdd(false)
            )
          }
          className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6"
        >
          <PayrollFormFields agents={agents} defaultPayday={nextPayday} loadAttendanceAction={loadAttendanceAction} />
          <button type="submit" disabled={isPending} className={buttonClasses}>
            Save as Draft
          </button>
        </form>
      )}

      <div className="mt-8 space-y-8">
        {orderedAgentIds.map((agentId) => {
          const agent = agentsById.get(agentId);
          const agentRecords = groups.get(agentId)!.slice().sort((a, b) => (a.payday < b.payday ? 1 : -1));
          return (
            <div key={agentId}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                {agent?.full_name ?? "Former agent"}
                {agent && <span className="font-normal normal-case text-slate-400"> · {agent.email}</span>}
              </h2>
              <div className="space-y-4">
                {agentRecords.map((record) => (
                  <div key={record.id} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
                    {editingId === record.id ? (
                      <form
                        action={(formData) =>
                          runAction(
                            () => updateAction(record.id, formData),
                            () => setEditingId(null)
                          )
                        }
                        className="space-y-3"
                      >
                        <PayrollFormFields
                          agents={agents}
                          defaultAgentId={record.agent_id}
                          defaultPayday={record.payday}
                          record={record}
                          lockAgent
                          requireConfirmApprovedEdit={record.status === "approved"}
                          loadAttendanceAction={loadAttendanceAction}
                        />
                        <div className="flex items-center gap-3">
                          <button type="submit" disabled={isPending} className={buttonClasses}>
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-sm font-medium text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {formatPayPeriodLabel(record.pay_period_start, record.pay_period_end)}
                            </p>
                            <p className="text-xs text-slate-500">Payday: {formatDateShort(record.payday)}</p>
                          </div>
                          <StatusBadge status={record.status} />
                        </div>

                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-xs text-slate-500">Standard Biweekly Pay</dt>
                            <dd className="font-medium text-slate-800">{formatNgn(record.standard_biweekly_pay)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Daily Rate</dt>
                            <dd className="font-medium text-slate-800">
                              {formatNgn(dailyRate(record.standard_biweekly_pay, record.standard_working_days))}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Days Present</dt>
                            <dd className="font-medium text-slate-800">{record.days_present}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Approved Paid Days</dt>
                            <dd className="font-medium text-slate-800">{record.approved_paid_days}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Unpaid Absence Days</dt>
                            <dd className="font-medium text-slate-800">{record.unpaid_absence_days}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Total Payable Days</dt>
                            <dd className="font-medium text-slate-800">{record.total_payable_days}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Base Pay Earned</dt>
                            <dd className="font-medium text-slate-800">{formatNgn(record.base_pay_earned)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Incentive / Bonus</dt>
                            <dd className="font-medium text-slate-800">{formatNgn(record.bonus_commission)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Other Additions</dt>
                            <dd className="font-medium text-slate-800">
                              {formatNgn(record.other_additions + record.internet_allowance)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Deductions</dt>
                            <dd className="font-medium text-slate-800">-{formatNgn(record.deductions)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Payment Method</dt>
                            <dd className="font-medium text-slate-800">{record.payment_method ?? "-"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Payment Date</dt>
                            <dd className="font-medium text-slate-800">
                              {record.actual_payment_date ? formatDateShort(record.actual_payment_date) : "-"}
                            </dd>
                          </div>
                        </dl>

                        <p className="mt-3 text-base font-bold text-slate-900">
                          Final Amount Payable: {formatNgn(record.total_pay)}
                        </p>

                        {record.admin_notes && (
                          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                            <span className="font-semibold">Notes for agent: </span>
                            {record.admin_notes}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          {(record.status === "draft" || record.status === "approved") && (
                            <button
                              type="button"
                              onClick={() => setEditingId(record.id)}
                              className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                            >
                              Edit
                            </button>
                          )}

                          {record.status === "draft" && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => {
                                const fd = new FormData();
                                runAction(() => approveAction(record.id, fd));
                              }}
                              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                            >
                              Approve
                            </button>
                          )}

                          {record.status === "approved" &&
                            (payingId === record.id ? (
                              <form
                                action={(formData) =>
                                  runAction(
                                    () => markPaidAction(record.id, formData),
                                    () => setPayingId(null)
                                  )
                                }
                                className="flex flex-wrap items-center gap-2"
                              >
                                <input
                                  type="date"
                                  name="actual_payment_date"
                                  required
                                  defaultValue={new Date().toISOString().slice(0, 10)}
                                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                                />
                                <PaymentMethodSelect />
                                <button type="submit" disabled={isPending} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full px-3 py-1.5">
                                  Confirm Paid
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPayingId(null)}
                                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                                >
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPayingId(record.id)}
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                              >
                                Mark as Paid
                              </button>
                            ))}

                          {(record.status === "draft" || record.status === "approved") &&
                            (cancellingId === record.id ? (
                              <form
                                action={(formData) =>
                                  runAction(
                                    () => cancelAction(record.id, formData),
                                    () => setCancellingId(null)
                                  )
                                }
                                className="flex flex-wrap items-center gap-2"
                              >
                                <input
                                  type="text"
                                  name="reason"
                                  required
                                  placeholder="Reason for cancelling"
                                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                                />
                                <button type="submit" disabled={isPending} className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-full px-3 py-1.5">
                                  Confirm Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCancellingId(null)}
                                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                                >
                                  Back
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setCancellingId(record.id)}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                              >
                                Cancel Record
                              </button>
                            ))}

                          {record.status === "paid" &&
                            (reopeningId === record.id ? (
                              <form
                                action={(formData) =>
                                  runAction(
                                    () => reopenAction(record.id, formData),
                                    () => {
                                      setReopeningId(null);
                                      setReopenConfirmed(false);
                                    }
                                  )
                                }
                                className="flex flex-wrap items-center gap-2"
                              >
                                <input
                                  type="text"
                                  name="reason"
                                  required
                                  placeholder="Reason for reopening"
                                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                                />
                                <label className="flex items-center gap-1.5 text-xs text-amber-800">
                                  <input
                                    type="checkbox"
                                    checked={reopenConfirmed}
                                    onChange={(e) => setReopenConfirmed(e.target.checked)}
                                  />
                                  Confirm reopen
                                  <input type="hidden" name="confirm_reopen" value={reopenConfirmed ? "true" : "false"} />
                                </label>
                                <button type="submit" disabled={isPending} className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-full px-3 py-1.5">
                                  Reopen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReopeningId(null);
                                    setReopenConfirmed(false);
                                  }}
                                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                                >
                                  Back
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setReopeningId(record.id)}
                                className="text-xs font-semibold text-amber-700 hover:text-amber-800"
                              >
                                Reopen
                              </button>
                            ))}

                          <button
                            type="button"
                            onClick={() => printStatement(record)}
                            className="text-xs font-semibold text-slate-600 hover:text-slate-800"
                          >
                            Print / Download Statement
                          </button>

                          <button
                            type="button"
                            onClick={() => setAuditOpenId(auditOpenId === record.id ? null : record.id)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                          >
                            {auditOpenId === record.id ? "Hide" : "View"} Audit Log
                          </button>
                        </div>

                        {auditOpenId === record.id && (
                          <AuditLogPanel entries={auditLog.filter((a) => a.payroll_id === record.id)} />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {orderedAgentIds.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] px-4 py-8 text-center text-slate-500">
            No payroll records match these filters.
          </p>
        )}
      </div>
    </div>
  );
}
