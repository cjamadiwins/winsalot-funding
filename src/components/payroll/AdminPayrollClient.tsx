"use client";

import { useState, useTransition } from "react";
import {
  formatDateShort,
  formatNgn,
  formatPayPeriodLabel,
  getPayPeriodForPayday,
  type PayrollRecord,
} from "@/lib/payroll";

type Agent = { id: string; full_name: string; email: string };

type ActionResult = { error?: string };

type Props = {
  agents: Agent[];
  records: PayrollRecord[];
  nextPayday: string;
  upcomingPaydays: string[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (recordId: string, formData: FormData) => Promise<ActionResult>;
  markPaidAction: (recordId: string, formData: FormData) => Promise<ActionResult>;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-slate-500";

function amountsTotal(form: { base: string; internet: string; bonus: string; deductions: string }) {
  const base = Number(form.base) || 0;
  const internet = Number(form.internet) || 0;
  const bonus = Number(form.bonus) || 0;
  const deductions = Number(form.deductions) || 0;
  return base + internet + bonus - deductions;
}

function PayrollFormFields({
  agents,
  defaultAgentId,
  defaultPayday,
  defaultBase,
  defaultInternet,
  defaultBonus,
  defaultDeductions,
  defaultNotes,
  lockAgent,
}: {
  agents: Agent[];
  defaultAgentId?: string;
  defaultPayday: string;
  defaultBase?: number;
  defaultInternet?: number;
  defaultBonus?: number;
  defaultDeductions?: number;
  defaultNotes?: string | null;
  lockAgent?: boolean;
}) {
  const [payday, setPayday] = useState(defaultPayday);
  const [amounts, setAmounts] = useState({
    base: String(defaultBase ?? ""),
    internet: String(defaultInternet ?? ""),
    bonus: String(defaultBonus ?? ""),
    deductions: String(defaultDeductions ?? ""),
  });
  const period = payday ? getPayPeriodForPayday(payday) : null;

  return (
    <>
      <div>
        <label className={labelClasses}>Agent</label>
        <select
          name="agent_id"
          required
          defaultValue={defaultAgentId ?? ""}
          disabled={lockAgent}
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
          <p className="mt-1 text-xs text-slate-500">
            Pay period: {formatPayPeriodLabel(period.start, period.end)}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Base Salary (₦)</label>
          <input
            type="number"
            name="base_salary"
            min={0}
            step="0.01"
            required
            value={amounts.base}
            onChange={(e) => setAmounts((a) => ({ ...a, base: e.target.value }))}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Internet Allowance (₦)</label>
          <input
            type="number"
            name="internet_allowance"
            min={0}
            step="0.01"
            value={amounts.internet}
            onChange={(e) => setAmounts((a) => ({ ...a, internet: e.target.value }))}
            className={`${inputClasses} mt-1`}
          />
        </div>
        <div>
          <label className={labelClasses}>Bonus / Commission (₦)</label>
          <input
            type="number"
            name="bonus_commission"
            min={0}
            step="0.01"
            value={amounts.bonus}
            onChange={(e) => setAmounts((a) => ({ ...a, bonus: e.target.value }))}
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
            value={amounts.deductions}
            onChange={(e) => setAmounts((a) => ({ ...a, deductions: e.target.value }))}
            className={`${inputClasses} mt-1`}
          />
        </div>
      </div>

      <p className="text-sm font-semibold text-slate-700">
        Total Pay: <span className="text-slate-900">{formatNgn(amountsTotal(amounts))}</span>
      </p>

      <div>
        <label className={labelClasses}>Admin Notes</label>
        <textarea
          name="admin_notes"
          rows={2}
          defaultValue={defaultNotes ?? ""}
          className={`${inputClasses} mt-1`}
        />
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: PayrollRecord["status"] }) {
  const classes =
    status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {status === "paid" ? "Paid" : "Pending"}
    </span>
  );
}

export default function AdminPayrollClient({
  agents,
  records,
  nextPayday,
  upcomingPaydays,
  createAction,
  updateAction,
  markPaidAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");

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
  const visibleRecords = agentFilter === "all" ? records : records.filter((r) => r.agent_id === agentFilter);

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
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setShowAdd((v) => !v)} className={buttonClasses}>
          {showAdd ? "Cancel" : "+ Add Payroll Record"}
        </button>

        <div className="flex items-center gap-2">
          <label htmlFor="agent-filter" className="text-xs font-medium text-slate-500">
            View history for
          </label>
          <select
            id="agent-filter"
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
          className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-6"
        >
          <PayrollFormFields agents={agents} defaultPayday={nextPayday} />
          <button type="submit" disabled={isPending} className={buttonClasses}>
            Save
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
                  <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-6">
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
                          defaultBase={record.base_salary}
                          defaultInternet={record.internet_allowance}
                          defaultBonus={record.bonus_commission}
                          defaultDeductions={record.deductions}
                          defaultNotes={record.admin_notes}
                          lockAgent
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
                            <dt className="text-xs text-slate-500">Base Salary</dt>
                            <dd className="font-medium text-slate-800">{formatNgn(record.base_salary)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Internet</dt>
                            <dd className="font-medium text-slate-800">{formatNgn(record.internet_allowance)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Bonus/Commission</dt>
                            <dd className="font-medium text-slate-800">{formatNgn(record.bonus_commission)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Deductions</dt>
                            <dd className="font-medium text-slate-800">-{formatNgn(record.deductions)}</dd>
                          </div>
                        </dl>

                        <p className="mt-3 text-base font-bold text-slate-900">
                          Total Pay: {formatNgn(record.total_pay)}
                        </p>

                        {record.status === "paid" && record.actual_payment_date && (
                          <p className="mt-1 text-xs text-slate-500">
                            Paid on {formatDateShort(record.actual_payment_date)}
                          </p>
                        )}

                        {record.admin_notes && (
                          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{record.admin_notes}</p>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          <button
                            type="button"
                            onClick={() => setEditingId(record.id)}
                            className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                          >
                            Edit
                          </button>
                          {record.status === "pending" &&
                            (markingPaidId === record.id ? (
                              <form
                                action={(formData) =>
                                  runAction(
                                    () => markPaidAction(record.id, formData),
                                    () => setMarkingPaidId(null)
                                  )
                                }
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="date"
                                  name="actual_payment_date"
                                  required
                                  defaultValue={new Date().toISOString().slice(0, 10)}
                                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                                />
                                <button
                                  type="submit"
                                  disabled={isPending}
                                  className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Confirm Paid
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMarkingPaidId(null)}
                                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                                >
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMarkingPaidId(record.id)}
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                              >
                                Mark as Paid
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {orderedAgentIds.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
            No payroll records yet.
          </p>
        )}
      </div>
    </div>
  );
}
