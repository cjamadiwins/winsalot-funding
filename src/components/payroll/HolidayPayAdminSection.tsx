"use client";

// Admin "Holiday Pay" section, shared by both CRMs' payroll pages. The
// underlying holidays/holiday_pay_assignments tables are a single shared
// store (supabase/migrations/0106_holiday_pay.sql) - this component only
// ever operates on the one CRM's own agent list (`agents`) and assignment
// rows (`assignments`), passed in already scoped by the page, but the
// holiday *definitions* it lists and creates are shared across both CRMs.

import { useState, useTransition } from "react";
import {
  HOLIDAY_PAY_CURRENCY,
  HOLIDAY_PAYMENT_TYPES,
  HOLIDAY_PAYMENT_TYPE_LABELS,
  type HolidayPaymentType,
  type HolidayPayAssignmentRow,
  type HolidayRow,
} from "@/lib/holiday-pay";
import { formatDateShort, formatNgn } from "@/lib/payroll";

type Agent = { id: string; full_name: string; email: string };

type AssignResult = { error?: string; assignedCount?: number; skipped?: { name: string; reason: string }[] };
type ActionResult = { error?: string };

type Props = {
  crmLabel: string;
  agents: Agent[];
  holidays: HolidayRow[];
  assignments: HolidayPayAssignmentRow[];
  createHolidayAction: (formData: FormData) => Promise<ActionResult>;
  updateHolidayAction: (holidayId: string, formData: FormData) => Promise<ActionResult>;
  deactivateHolidayAction: (holidayId: string, formData: FormData) => Promise<ActionResult>;
  reactivateHolidayAction: (holidayId: string) => Promise<ActionResult>;
  deleteHolidayAction: (holidayId: string, formData: FormData) => Promise<ActionResult>;
  assignHolidayAction: (holidayId: string, formData: FormData) => Promise<AssignResult>;
  removeAssignmentAction: (assignmentId: string, formData: FormData) => Promise<ActionResult>;
  overrideAssignmentAmountAction: (assignmentId: string, formData: FormData) => Promise<ActionResult>;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const dangerButtonClasses =
  "rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-slate-500";

function HolidayForm({
  holiday,
  onSubmit,
  submitLabel,
}: {
  holiday?: HolidayRow;
  onSubmit: (formData: FormData) => void;
  submitLabel: string;
}) {
  const [paymentType, setPaymentType] = useState<HolidayPaymentType>(holiday?.payment_type ?? "regular_paid_day");

  return (
    <form
      action={onSubmit}
      className="space-y-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Holiday Name</label>
          <input type="text" name="name" required defaultValue={holiday?.name} className={`${inputClasses} mt-1`} />
        </div>
        <div>
          <label className={labelClasses}>Holiday Date</label>
          <input
            type="date"
            name="holiday_date"
            required
            defaultValue={holiday?.holiday_date}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Country / Jurisdiction</label>
          <input
            type="text"
            name="jurisdiction"
            required
            defaultValue={holiday?.jurisdiction}
            placeholder="e.g. Canada/Ontario"
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Currency</label>
          <input type="text" disabled value={HOLIDAY_PAY_CURRENCY} className={`${inputClasses} mt-1 bg-slate-50 text-slate-500`} />
          <p className="mt-1 text-[11px] font-normal normal-case text-slate-400">
            Holiday pay always follows the agent&apos;s payroll currency — independent of the jurisdiction above.
          </p>
        </div>
      </div>

      <div>
        <label className={labelClasses}>Description</label>
        <textarea name="description" rows={2} defaultValue={holiday?.description ?? ""} className={`${inputClasses} mt-1`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Payment Type</label>
          <select
            name="payment_type"
            required
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as HolidayPaymentType)}
            className={`${inputClasses} mt-1`}
          >
            {HOLIDAY_PAYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {HOLIDAY_PAYMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        {paymentType === "fixed_amount" && (
          <div>
            <label className={labelClasses}>Fixed Amount</label>
            <input
              type="number"
              name="amount"
              min={0}
              step="0.01"
              required
              defaultValue={holiday?.amount ?? undefined}
              className={`${inputClasses} mt-1`}
            />
          </div>
        )}
        {paymentType === "percentage_premium" && (
          <div>
            <label className={labelClasses}>Premium Percentage (%)</label>
            <input
              type="number"
              name="percentage"
              min={0}
              step="0.01"
              required
              defaultValue={holiday?.percentage ?? undefined}
              className={`${inputClasses} mt-1`}
            />
          </div>
        )}
      </div>

      <div>
        <label className={labelClasses}>Payroll Period (payday this holiday applies to)</label>
        <input
          type="date"
          name="payroll_period_payday"
          defaultValue={holiday?.payroll_period_payday ?? ""}
          className={`${inputClasses} mt-1`}
        />
      </div>

      <div>
        <label className={labelClasses}>Eligibility Notes</label>
        <textarea
          name="eligibility_notes"
          rows={2}
          defaultValue={holiday?.eligibility_notes ?? ""}
          placeholder="e.g. Only applies to agents based in Canada."
          className={`${inputClasses} mt-1`}
        />
      </div>

      {holiday && (
        <div>
          <label className={labelClasses}>Reason for this edit (optional)</label>
          <textarea name="edit_reason" rows={1} className={`${inputClasses} mt-1`} />
        </div>
      )}

      <button type="submit" className={buttonClasses}>
        {submitLabel}
      </button>
    </form>
  );
}

function AssignmentsPanel({
  holiday,
  agents,
  assignments,
  assignHolidayAction,
  removeAssignmentAction,
  overrideAssignmentAmountAction,
}: {
  holiday: HolidayRow;
  agents: Agent[];
  assignments: HolidayPayAssignmentRow[];
  assignHolidayAction: Props["assignHolidayAction"];
  removeAssignmentAction: Props["removeAssignmentAction"];
  overrideAssignmentAmountAction: Props["overrideAssignmentAmountAction"];
}) {
  const [isPending, startTransition] = useTransition();
  const [allAgents, setAllAgents] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overridingId, setOverridingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const agentsById = new Map(agents.map((a) => [a.id, a]));
  const holidayAssignments = assignments.filter((a) => a.holiday_id === holiday.id);

  function toggleSelected(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function handleAssign(formData: FormData) {
    setError(null);
    setMessage(null);
    if (allAgents) formData.set("all_agents", "true");
    for (const id of selectedIds) formData.append("agent_ids", id);
    startTransition(async () => {
      const result = await assignHolidayAction(holiday.id, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      const parts = [`Assigned to ${result.assignedCount ?? 0} agent(s).`];
      if (result.skipped && result.skipped.length > 0) {
        parts.push(`Skipped: ${result.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}`);
      }
      setMessage(parts.join(" "));
      setSelectedIds([]);
      setAllAgents(false);
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assign to Agents</p>

      <form action={handleAssign} className="mt-2 space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={allAgents} onChange={(e) => setAllAgents(e.target.checked)} />
          All Agents
        </label>
        {!allAgents && (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {agents.map((agent) => (
              <label key={agent.id} className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(agent.id)}
                  onChange={() => toggleSelected(agent.id)}
                />
                {agent.full_name}
              </label>
            ))}
          </div>
        )}
        <input type="text" name="assignment_note" placeholder="Optional note" className={`${inputClasses}`} />
        <button type="submit" disabled={isPending} className={buttonClasses}>
          Assign
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}

      <div className="mt-4 space-y-2">
        {holidayAssignments.length === 0 ? (
          <p className="text-xs text-slate-500">No agents assigned yet.</p>
        ) : (
          holidayAssignments.map((assignment) => {
            const agentId = assignment.crm_user_id ?? assignment.leadgen_user_id ?? "";
            const agent = agentsById.get(agentId);
            return (
              <div
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
              >
                <div>
                  <p className="font-medium text-slate-800">{agent?.full_name ?? "Former agent"}</p>
                  <p className="text-slate-500">
                    {formatNgn(assignment.effective_amount)}
                    {assignment.override_amount !== null && (
                      <span> (overridden - {assignment.override_reason})</span>
                    )}
                    {assignment.status === "cancelled" && <span className="text-rose-600"> - Removed</span>}
                  </p>
                </div>
                {assignment.status === "assigned" && (
                  <div className="flex items-center gap-2">
                    {overridingId === assignment.id ? (
                      <form
                        action={(formData) =>
                          startTransition(async () => {
                            const result = await overrideAssignmentAmountAction(assignment.id, formData);
                            if (result.error) setError(result.error);
                            else setOverridingId(null);
                          })
                        }
                        className="flex items-center gap-1"
                      >
                        <input
                          type="number"
                          name="override_amount"
                          min={0}
                          step="0.01"
                          required
                          placeholder="Amount"
                          className="w-24 rounded border border-slate-300 px-2 py-1"
                        />
                        <input
                          type="text"
                          name="override_reason"
                          required
                          placeholder="Explanation"
                          className="w-32 rounded border border-slate-300 px-2 py-1"
                        />
                        <button type="submit" className="font-semibold text-sky-600">
                          Save
                        </button>
                        <button type="button" onClick={() => setOverridingId(null)} className="text-slate-500">
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button type="button" onClick={() => setOverridingId(assignment.id)} className="font-semibold text-sky-600">
                        Override
                      </button>
                    )}
                    {removingId === assignment.id ? (
                      <form
                        action={(formData) =>
                          startTransition(async () => {
                            const result = await removeAssignmentAction(assignment.id, formData);
                            if (result.error) setError(result.error);
                            else setRemovingId(null);
                          })
                        }
                        className="flex items-center gap-1"
                      >
                        <input type="text" name="reason" required placeholder="Reason" className="w-32 rounded border border-slate-300 px-2 py-1" />
                        <button type="submit" className="font-semibold text-rose-600">
                          Confirm Remove
                        </button>
                        <button type="button" onClick={() => setRemovingId(null)} className="text-slate-500">
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button type="button" onClick={() => setRemovingId(assignment.id)} className="font-semibold text-rose-600">
                        Remove
                      </button>
                    )}
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

export default function HolidayPayAdminSection({
  crmLabel,
  agents,
  holidays,
  assignments,
  createHolidayAction,
  updateHolidayAction,
  deactivateHolidayAction,
  reactivateHolidayAction,
  deleteHolidayAction,
  assignHolidayAction,
  removeAssignmentAction,
  overrideAssignmentAmountAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Holiday Pay</h2>
          <p className="mt-1 text-sm text-slate-500">
            A shared holiday calendar across both CRMs. Assign eligibility explicitly for {crmLabel} agents -
            holidays never apply automatically.
          </p>
        </div>
        <button type="button" onClick={() => setShowAdd((v) => !v)} className={buttonClasses}>
          {showAdd ? "Cancel" : "+ New Holiday"}
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showAdd && (
        <div className="mt-4">
          <HolidayForm
            onSubmit={(formData) => runAction(() => createHolidayAction(formData), () => setShowAdd(false))}
            submitLabel="Create Holiday"
          />
        </div>
      )}

      <div className="mt-6 space-y-4">
        {holidays.length === 0 ? (
          <p className="text-sm text-slate-500">No holidays defined yet.</p>
        ) : (
          holidays.map((holiday) => (
            <div key={holiday.id} className="rounded-2xl border border-slate-200 p-5">
              {editingId === holiday.id ? (
                <HolidayForm
                  holiday={holiday}
                  onSubmit={(formData) => runAction(() => updateHolidayAction(holiday.id, formData), () => setEditingId(null))}
                  submitLabel="Save Changes"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {holiday.name}{" "}
                        <span className="font-normal text-slate-500">- {formatDateShort(holiday.holiday_date)}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {holiday.jurisdiction} · {HOLIDAY_PAYMENT_TYPE_LABELS[holiday.payment_type]} · {HOLIDAY_PAY_CURRENCY}
                      </p>
                      {holiday.eligibility_notes && (
                        <p className="mt-1 text-xs italic text-slate-500">{holiday.eligibility_notes}</p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        holiday.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {holiday.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
                    <button type="button" onClick={() => setEditingId(holiday.id)} className="text-sky-600 hover:text-sky-700">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === holiday.id ? null : holiday.id)}
                      className="text-sky-600 hover:text-sky-700"
                    >
                      {expandedId === holiday.id ? "Hide Assignments" : "Manage Assignments"}
                    </button>
                    {holiday.is_active ? (
                      deactivatingId === holiday.id ? (
                        <form
                          action={(formData) => runAction(() => deactivateHolidayAction(holiday.id, formData), () => setDeactivatingId(null))}
                          className="flex items-center gap-1"
                        >
                          <input type="text" name="reason" required placeholder="Reason" className="rounded border border-slate-300 px-2 py-1" />
                          <button type="submit" disabled={isPending} className="text-amber-700">
                            Confirm
                          </button>
                          <button type="button" onClick={() => setDeactivatingId(null)} className="text-slate-500">
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button type="button" onClick={() => setDeactivatingId(holiday.id)} className="text-amber-700 hover:text-amber-800">
                          Deactivate
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => runAction(() => reactivateHolidayAction(holiday.id))}
                        disabled={isPending}
                        className="text-emerald-700 hover:text-emerald-800"
                      >
                        Reactivate
                      </button>
                    )}
                    {deletingId === holiday.id ? (
                      <form
                        action={(formData) =>
                          runAction(() => deleteHolidayAction(holiday.id, formData), () => {
                            setDeletingId(null);
                            setConfirmDelete(false);
                          })
                        }
                        className="flex flex-wrap items-center gap-1"
                      >
                        <label className="flex items-center gap-1 text-rose-700">
                          <input
                            type="checkbox"
                            checked={confirmDelete}
                            onChange={(e) => setConfirmDelete(e.target.checked)}
                          />
                          I understand this will delete the holiday.
                          <input type="hidden" name="confirm_delete" value={confirmDelete ? "true" : "false"} />
                        </label>
                        <input type="text" name="reason" required placeholder="Reason" className="rounded border border-slate-300 px-2 py-1" />
                        <button type="submit" disabled={isPending || !confirmDelete} className={dangerButtonClasses}>
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingId(null);
                            setConfirmDelete(false);
                          }}
                          className="text-slate-500"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button type="button" onClick={() => setDeletingId(holiday.id)} className="text-rose-600 hover:text-rose-700">
                        Delete
                      </button>
                    )}
                  </div>

                  {expandedId === holiday.id && (
                    <AssignmentsPanel
                      holiday={holiday}
                      agents={agents}
                      assignments={assignments}
                      assignHolidayAction={assignHolidayAction}
                      removeAssignmentAction={removeAssignmentAction}
                      overrideAssignmentAmountAction={overrideAssignmentAmountAction}
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
