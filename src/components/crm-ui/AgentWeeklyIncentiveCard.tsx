import { formatNgn } from "@/lib/payroll";
import {
  WINSALOT_INCENTIVE_STATUS_LABEL,
  WINSALOT_INCENTIVE_STATUS_STYLES,
  type WinsalotIncentivePeriodStatus,
} from "@/lib/agent-incentive-shared";
import PerformanceRing from "@/components/crm-ui/PerformanceRing";

// Weekly Agent Incentive card - shared by both CRMs' agent dashboards
// (leadgen/agent/page.tsx and agent/page.tsx), the same way KpiCard and
// PerformanceRing already are, so the two can never drift out of sync
// with each other on layout or field list. Renders only the numbers the
// calling page computed for the signed-in agent - never fetches
// anything itself, so it cannot leak another agent's data regardless of
// what it's given.
export default function AgentWeeklyIncentiveCard({
  weekLabel,
  recordLabel,
  qualifiedCount,
  quota,
  percentage,
  quotaMet,
  calculatedBonus,
  periodStatus,
  monthLabel,
  monthToDateApproved,
  monthlyCap,
  remainingToCap,
}: {
  weekLabel: string;
  recordLabel: string; // "qualified appointments" or "qualified quotes"
  qualifiedCount: number;
  quota: number;
  percentage: number;
  quotaMet: boolean;
  calculatedBonus: number;
  periodStatus: WinsalotIncentivePeriodStatus;
  monthLabel: string;
  monthToDateApproved: number;
  monthlyCap: number;
  remainingToCap: number;
}) {
  const tier = quotaMet ? "green" : percentage >= 40 ? "yellow" : "red";

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Weekly Incentive</h2>
        <span className="text-[12px] text-slate-500">Week of {weekLabel}</span>
      </div>

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <PerformanceRing percentage={percentage} tier={tier} label="of weekly quota" />
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label={`This Week's ${recordLabel}`} value={String(qualifiedCount)} />
          <Stat label="Weekly Quota" value={String(quota)} />
          <Stat label="Weekly Bonus" value={formatNgn(calculatedBonus)} />
        </div>
      </div>

      <p className="mt-3 text-[12.5px] text-slate-500">
        {quotaMet
          ? `Quota met - full weekly bonus earned.`
          : `${Math.max(0, quota - qualifiedCount)} more ${recordLabel} needed to earn this week's bonus. No partial bonus is awarded for missing the quota.`}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Approval Status</div>
          <div className="mt-1.5">
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${WINSALOT_INCENTIVE_STATUS_STYLES[periodStatus]}`}>
              {WINSALOT_INCENTIVE_STATUS_LABEL[periodStatus]}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Month-to-Date Approved</div>
          <div className="mt-1 text-[18px] font-extrabold text-slate-900">{formatNgn(monthToDateApproved)}</div>
          <div className="mt-1 text-[11px] text-slate-500">{monthLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Remaining Before Cap</div>
          <div className="mt-1 text-[18px] font-extrabold text-slate-900">{formatNgn(remainingToCap)}</div>
          <div className="mt-1 text-[11px] text-slate-500">of {formatNgn(monthlyCap)} monthly cap</div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-[17px] font-bold text-slate-900">{value}</div>
    </div>
  );
}
