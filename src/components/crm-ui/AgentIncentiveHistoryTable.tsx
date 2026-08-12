import { formatNgn } from "@/lib/payroll";
import {
  WEEKLY_INCENTIVE_DISPLAY_STATUS_LABEL,
  WEEKLY_INCENTIVE_DISPLAY_STATUS_STYLES,
  deriveWeeklyIncentiveDisplayStatus,
  type WinsalotAgentIncentiveLedgerRow,
} from "@/lib/agent-incentive-shared";

// "A link to the agent's weekly incentive history" (brief) - every week
// that ever got a ledger row (approved, rejected, or paid), most recent
// first. A week with no row at all (never reached quota, or reached it
// but was never reviewed) simply never appears here - "historical
// results must remain available" (brief) is satisfied by the ledger
// itself never being rewritten once a week is reviewed (see migration
// 0059's header comment), not by this read-only table.
export default function AgentIncentiveHistoryTable({ rows, recordLabel }: { rows: WinsalotAgentIncentiveLedgerRow[]; recordLabel: string }) {
  if (rows.length === 0) {
    return <p className="mt-6 text-[13.5px] text-slate-500">No reviewed weeks yet.</p>;
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
            <th className="p-3">Week</th>
            <th className="p-3">{recordLabel}</th>
            <th className="p-3">Status</th>
            <th className="p-3">Approved Amount</th>
            <th className="p-3">Reason</th>
            <th className="p-3">Paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = deriveWeeklyIncentiveDisplayStatus(row.qualified_count, row.weekly_quota, row);
            return (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="p-3 font-medium text-slate-900">
                  {row.week_start} – {row.week_end}
                </td>
                <td className="p-3 text-slate-600">
                  {row.qualified_count} / {row.weekly_quota}
                </td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${WEEKLY_INCENTIVE_DISPLAY_STATUS_STYLES[status]}`}>
                    {WEEKLY_INCENTIVE_DISPLAY_STATUS_LABEL[status]}
                  </span>
                </td>
                <td className="p-3 text-slate-600">{row.approved_total != null ? formatNgn(row.approved_total) : "—"}</td>
                <td className="p-3 text-slate-600">{row.adjustment_reason ?? "—"}</td>
                <td className="p-3 text-slate-600">{row.payment_date ?? (row.paid_at ? new Date(row.paid_at).toLocaleDateString() : "—")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
