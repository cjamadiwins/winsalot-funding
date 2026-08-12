"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { formatNgn } from "@/lib/payroll";
import {
  WINSALOT_INCENTIVE_STATUS_LABEL,
  WINSALOT_INCENTIVE_STATUS_STYLES,
  winsalotIncentivePeriodStatus,
  type WinsalotAgentIncentiveLedgerRow,
  type WinsalotIncentiveSettings,
} from "@/lib/agent-incentive-shared";

export type AdminIncentiveRow = {
  agentId: string;
  agentName: string;
  qualifiedCount: number;
  quota: number;
  quotaMet: boolean;
  calculatedBonus: number;
  ledgerRow: WinsalotAgentIncentiveLedgerRow | null;
  // This agent's own approved+paid total for the calendar month,
  // summed across BOTH CRMs, excluding this week's own row - shown so
  // an admin can see the ₦25,000 cap headroom before approving.
  monthToDateApprovedOther: number;
};

export type AuditRow = {
  id: string;
  agent_name: string;
  crm: "leadgen" | "cleaning";
  week_start: string;
  week_end: string;
  action: "approved" | "adjusted" | "paid";
  previous_total: number | null;
  new_total: number;
  reason: string | null;
  performed_by_name: string;
  occurred_at: string;
};

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

const AUDIT_ACTION_LABEL: Record<AuditRow["action"], string> = {
  approved: "Approved",
  adjusted: "Adjusted",
  paid: "Marked Paid",
};

// Weekly Agent Incentive - the admin "Agent Incentives" section shared
// by both CRMs (used by /leadgen/admin/incentives and
// /admin/crm/incentives), so the two can never drift out of sync on
// layout, the approve/adjust/pay flow, or how the monthly cap warning is
// shown. Each page passes its own CRM-specific Server Actions
// (approveAction/markPaidAction/updateSettingsAction) - this component
// never talks to Supabase directly.
export default function AdminWeeklyIncentivesClient({
  recordLabel,
  weekLabel,
  prevWeekHref,
  nextWeekHref,
  monthLabel,
  settings,
  quotaFieldName,
  amountFieldName,
  rows,
  auditRows,
  approveAction,
  markPaidAction,
  updateSettingsAction,
}: {
  recordLabel: string;
  weekLabel: string;
  prevWeekHref: string;
  nextWeekHref: string;
  monthLabel: string;
  settings: WinsalotIncentiveSettings;
  quotaFieldName: "leadgen_weekly_quota" | "crm_weekly_quota";
  amountFieldName: "leadgen_weekly_bonus_amount" | "crm_weekly_bonus_amount";
  rows: AdminIncentiveRow[];
  auditRows: AuditRow[];
  approveAction: (agentId: string, formData: FormData) => Promise<{ error?: string } | void>;
  markPaidAction: (ledgerId: string) => Promise<{ error?: string } | void>;
  updateSettingsAction: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [approvingAgentId, setApprovingAgentId] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const weeklyQuota = quotaFieldName === "leadgen_weekly_quota" ? settings.leadgenWeeklyQuota : settings.crmWeeklyQuota;
  const weeklyBonusAmount = amountFieldName === "leadgen_weekly_bonus_amount" ? settings.leadgenWeeklyBonusAmount : settings.crmWeeklyBonusAmount;

  function runAction(fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  return (
    <div className="mt-6 space-y-8">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Incentive Rules</h2>
          <button type="button" onClick={() => setShowSettings((v) => !v)} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
            {showSettings ? "Close" : "Edit"}
          </button>
        </div>
        {!showSettings ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
            <RuleStat label="Weekly Quota" value={String(weeklyQuota)} />
            <RuleStat label="Weekly Bonus" value={formatNgn(weeklyBonusAmount)} />
            <RuleStat label="Monthly Cap (per agent, both CRMs)" value={formatNgn(settings.monthlyCap)} />
          </dl>
        ) : (
          <form
            action={(formData) => runAction(() => updateSettingsAction(formData), () => setShowSettings(false))}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-600">Weekly Quota ({recordLabel})</span>
              <input name={quotaFieldName} type="number" min={1} step={1} defaultValue={weeklyQuota} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-600">Weekly Bonus (₦)</span>
              <input name={amountFieldName} type="number" min={0} step="0.01" defaultValue={weeklyBonusAmount} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-600">Monthly Cap (₦, shared across both CRMs)</span>
              <input name="monthly_cap" type="number" min={0} step="0.01" defaultValue={settings.monthlyCap} required className={inputClass} />
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
                Save Rules
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Weekly Bonuses</h2>
          <div className="flex items-center gap-3 text-[13px]">
            <Link href={prevWeekHref} className="font-semibold text-sky-600 hover:text-sky-700">
              ← Prev Week
            </Link>
            <span className="font-semibold text-slate-700">Week of {weekLabel}</span>
            <Link href={nextWeekHref} className="font-semibold text-sky-600 hover:text-sky-700">
              Next Week →
            </Link>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[980px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                <th className="p-2.5">Agent</th>
                <th className="p-2.5">{recordLabel}</th>
                <th className="p-2.5">Quota Met</th>
                <th className="p-2.5">Calculated Bonus</th>
                <th className="p-2.5">Approved Total</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">Month-to-Date, {monthLabel} (both CRMs)</th>
                <th className="p-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const periodStatus = winsalotIncentivePeriodStatus(row.ledgerRow);
                const canApprove = periodStatus !== "paid";
                const projectedIfApprovedAtCalculated = row.monthToDateApprovedOther + row.calculatedBonus;
                return (
                  <Fragment key={row.agentId}>
                    <tr className="border-b border-slate-100">
                      <td className="p-2.5 font-semibold text-slate-900">{row.agentName}</td>
                      <td className="p-2.5 text-slate-700">
                        {row.qualifiedCount} / {row.quota}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
                            row.quotaMet ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.quotaMet ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="p-2.5 font-semibold text-slate-900">{formatNgn(row.calculatedBonus)}</td>
                      <td className="p-2.5 text-slate-700">{row.ledgerRow?.approved_total != null ? formatNgn(row.ledgerRow.approved_total) : "—"}</td>
                      <td className="p-2.5">
                        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${WINSALOT_INCENTIVE_STATUS_STYLES[periodStatus]}`}>
                          {WINSALOT_INCENTIVE_STATUS_LABEL[periodStatus]}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-700">
                        {formatNgn(row.monthToDateApprovedOther)}
                        {projectedIfApprovedAtCalculated > settings.monthlyCap && (
                          <div className="mt-0.5 text-[11px] font-semibold text-rose-600">
                            ⚠ Approving the full calculated bonus would exceed the {formatNgn(settings.monthlyCap)} cap.
                          </div>
                        )}
                      </td>
                      <td className="p-2.5">
                        <div className="flex flex-wrap gap-2">
                          {canApprove && (
                            <button
                              type="button"
                              onClick={() => setApprovingAgentId(approvingAgentId === row.agentId ? null : row.agentId)}
                              className="text-[12px] font-semibold text-sky-600 hover:text-sky-700"
                            >
                              {periodStatus === "approved" ? "Adjust" : "Approve"}
                            </button>
                          )}
                          {periodStatus === "approved" && row.ledgerRow && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => runAction(() => markPaidAction(row.ledgerRow!.id))}
                              className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {approvingAgentId === row.agentId && (
                      <tr>
                        <td colSpan={8} className="border-b border-slate-100 bg-slate-50 p-4">
                          <form
                            action={(formData) =>
                              runAction(
                                () => approveAction(row.agentId, formData),
                                () => setApprovingAgentId(null)
                              )
                            }
                            className="flex flex-wrap items-end gap-3"
                          >
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[12px] font-semibold text-slate-600">Approved Total (₦)</span>
                              <input
                                name="approved_total"
                                type="number"
                                min={0}
                                step="0.01"
                                defaultValue={row.calculatedBonus}
                                className={`${inputClass} w-40`}
                              />
                            </label>
                            <label className="flex flex-1 min-w-[220px] flex-col gap-1.5">
                              <span className="text-[12px] font-semibold text-slate-600">
                                Adjustment Reason (required only if the approved total differs from {formatNgn(row.calculatedBonus)})
                              </span>
                              <input name="adjustment_reason" type="text" className={inputClass} />
                            </label>
                            <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-sky-700">
                              Save Approval
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Incentive Audit History</h2>
          <button type="button" onClick={() => setShowAudit((v) => !v)} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
            {showAudit ? "Hide" : "Show"}
          </button>
        </div>
        {showAudit &&
          (auditRows.length === 0 ? (
            <p className="mt-3 text-[13px] text-slate-500">No bonus actions recorded yet.</p>
          ) : (
            <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[820px] text-left text-[12.5px]">
                <thead className="sticky top-0 bg-[var(--crm-surface)]">
                  <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                    <th className="p-2.5">When</th>
                    <th className="p-2.5">Agent</th>
                    <th className="p-2.5">Week</th>
                    <th className="p-2.5">Action</th>
                    <th className="p-2.5">Previous → New</th>
                    <th className="p-2.5">Reason</th>
                    <th className="p-2.5">By</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="p-2.5 text-slate-600">{new Date(row.occurred_at).toLocaleString()}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{row.agent_name}</td>
                      <td className="p-2.5 text-slate-600">Week of {row.week_start}</td>
                      <td className="p-2.5 text-slate-700">{AUDIT_ACTION_LABEL[row.action]}</td>
                      <td className="p-2.5 text-slate-700">
                        {row.previous_total != null ? formatNgn(row.previous_total) : "—"} → {formatNgn(row.new_total)}
                      </td>
                      <td className="p-2.5 text-slate-600">{row.reason ?? "—"}</td>
                      <td className="p-2.5 text-slate-600">{row.performed_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </div>
  );
}

function RuleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-[14px] font-bold text-slate-900">{value}</div>
    </div>
  );
}
