import type { CrmAgentPerformance, CrmBiweeklyPeriodPerformance, CrmPerformanceTier } from "@/lib/crm-performance";
import {
  CRM_BIWEEKLY_CONSULTATIONS_TARGET,
  CRM_BIWEEKLY_QUALIFIED_TARGET,
  CRM_BIWEEKLY_APPLICATIONS_TARGET,
  CRM_BIWEEKLY_PROPOSALS_TARGET,
  CRM_BIWEEKLY_WON_TARGET,
  CRM_CATEGORY_WEIGHT,
  CRM_PERFORMANCE_TIER_LABEL,
  crmBiweeklyRangeLabel,
  crmPerformanceTier,
} from "@/lib/crm-performance";
import PerformanceRing, { GROWTH_CRM_GAUGE_SEGMENTS } from "@/components/crm-ui/PerformanceRing";

// One color per tier, shared by every percentage badge, progress bar, and
// status pill for a given metric so they never disagree with the gauge's
// own bands (0-39 red, 40-59 yellow/amber, 60-79 green, 80-100 blue - see
// crmPerformanceTier).
const TIER_STYLES: Record<CrmPerformanceTier, { bar: string; badge: string; text: string }> = {
  blue: { bar: "bg-sky-500", badge: "bg-sky-100 text-sky-800", text: "text-sky-700" },
  green: { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  yellow: { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  red: { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-800", text: "text-rose-700" },
};

// The gauge's own band labels (Needs Improvement / Fair / Good /
// Excellent) - imported rather than redefined so this status pill can
// never drift from the gauge's centre score and colour band.
const TIER_STATUS_LABEL = CRM_PERFORMANCE_TIER_LABEL;

// Renders one agent's biweekly Agent Performance Report card - shared by
// the admin's "every agent" view (/admin/crm/performance) and an agent's
// own "just me" view (/agent/performance), so the two can never drift out
// of sync with each other.
export default function CrmPerformanceCard({ agentName, performance }: { agentName: string; performance: CrmAgentPerformance }) {
  const { current, history } = performance;

  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{agentName}</h2>
        <span className="text-[12px] text-slate-500">Period: {crmBiweeklyRangeLabel(current.periodStart, current.periodEnd)}</span>
      </div>

      <PeriodDetails period={current} />

      {history.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Previous Periods</div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                  <th className="p-2.5">Period</th>
                  <th className="p-2.5">Consultations</th>
                  <th className="p-2.5">Added</th>
                  <th className="p-2.5">Applications</th>
                  <th className="p-2.5">Emails Delivered</th>
                  <th className="p-2.5">Clients Won</th>
                  <th className="p-2.5">Overall</th>
                </tr>
              </thead>
              <tbody>
                {history.map((period) => {
                  const tier = crmPerformanceTier(period.overallPercentage);
                  return (
                    <tr key={period.periodStart} className="border-b border-slate-100 last:border-0">
                      <td className="p-2.5 text-slate-600">{crmBiweeklyRangeLabel(period.periodStart, period.periodEnd)}</td>
                      <td className="p-2.5 font-medium text-slate-900">
                        {period.consultationsBooked}/{CRM_BIWEEKLY_CONSULTATIONS_TARGET}
                      </td>
                      <td className="p-2.5 font-medium text-slate-900">
                        {period.qualifiedOpportunities}/{CRM_BIWEEKLY_QUALIFIED_TARGET}
                      </td>
                      <td className="p-2.5 font-medium text-slate-900">
                        {period.applicationsSubmitted}/{CRM_BIWEEKLY_APPLICATIONS_TARGET}
                      </td>
                      <td className="p-2.5 font-medium text-slate-900">
                        {period.proposalsSent}/{CRM_BIWEEKLY_PROPOSALS_TARGET}
                      </td>
                      <td className="p-2.5 font-medium text-slate-900">
                        {period.clientsWon}/{CRM_BIWEEKLY_WON_TARGET}
                      </td>
                      <td className="p-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TIER_STYLES[tier].badge}`}>
                          {period.overallPercentage}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function PeriodDetails({ period }: { period: CrmBiweeklyPeriodPerformance }) {
  const consultationsTier = crmPerformanceTier(period.consultationsPercentage);
  const qualifiedTier = crmPerformanceTier(period.qualifiedPercentage);
  const applicationsTier = crmPerformanceTier(period.applicationsPercentage);
  const proposalsTier = crmPerformanceTier(period.proposalsPercentage);
  const wonTier = crmPerformanceTier(period.wonPercentage);
  const overallTier = crmPerformanceTier(period.overallPercentage);

  return (
    <>
      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8 lg:gap-10">
        <PerformanceRing
          percentage={period.overallPercentage}
          tier={overallTier}
          label="of biweekly target"
          size={180}
          strokeWidth={14}
          segments={GROWTH_CRM_GAUGE_SEGMENTS}
        />
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Stat label="Consultations Booked" value={`${period.consultationsBooked}/${CRM_BIWEEKLY_CONSULTATIONS_TARGET}`} />
          <Stat label="Opportunities Added" value={`${period.qualifiedOpportunities}/${CRM_BIWEEKLY_QUALIFIED_TARGET}`} />
          <Stat label="Funding Applications Submitted" value={`${period.applicationsSubmitted}/${CRM_BIWEEKLY_APPLICATIONS_TARGET}`} />
          <Stat label="Emails Delivered" value={`${period.proposalsSent}/${CRM_BIWEEKLY_PROPOSALS_TARGET}`} />
          <Stat label="Clients Won" value={`${period.clientsWon}/${CRM_BIWEEKLY_WON_TARGET}`} />
          <Stat label="Overall Performance" value={`${period.overallPercentage}%`} badgeClassName={TIER_STYLES[overallTier].badge} />
        </div>
      </div>

      <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Biweekly Progress</div>
      <ProgressGoal label="Consultations Booked Progress" percentage={period.consultationsPercentage} tier={consultationsTier} />
      <ProgressGoal label="Opportunities Added Progress" percentage={period.qualifiedPercentage} tier={qualifiedTier} />
      <ProgressGoal label="Funding Applications Submitted Progress" percentage={period.applicationsPercentage} tier={applicationsTier} />
      <ProgressGoal label="Emails Delivered Progress" percentage={period.proposalsPercentage} tier={proposalsTier} />
      <ProgressGoal label="Clients Won Progress" percentage={period.wonPercentage} tier={wonTier} />

      <ScorecardTable period={period} />

      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Biweekly Performance Status</span>
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TIER_STYLES[overallTier].badge}`}>
          {TIER_STATUS_LABEL[overallTier]} — {period.overallPercentage}%
        </span>
      </div>
    </>
  );
}

// The scorecard behind the gauge's centre score: each category's actual
// result, target, achievement percentage (capped at 100%), fixed 20%
// weight, and weighted contribution (percentage x weight) - the five
// weighted contributions are exactly what sum to the gauge's overall
// score, so this table is the arithmetic the gauge is showing, made
// visible.
function ScorecardTable({ period }: { period: CrmBiweeklyPeriodPerformance }) {
  const rows: Array<{ label: string; actual: number; target: number; percentage: number }> = [
    { label: "Opportunities Added", actual: period.qualifiedOpportunities, target: CRM_BIWEEKLY_QUALIFIED_TARGET, percentage: period.qualifiedPercentage },
    { label: "Consultations Booked", actual: period.consultationsBooked, target: CRM_BIWEEKLY_CONSULTATIONS_TARGET, percentage: period.consultationsPercentage },
    { label: "Emails Delivered", actual: period.proposalsSent, target: CRM_BIWEEKLY_PROPOSALS_TARGET, percentage: period.proposalsPercentage },
    {
      label: "Funding Applications Submitted",
      actual: period.applicationsSubmitted,
      target: CRM_BIWEEKLY_APPLICATIONS_TARGET,
      percentage: period.applicationsPercentage,
    },
    { label: "Clients Won", actual: period.clientsWon, target: CRM_BIWEEKLY_WON_TARGET, percentage: period.wonPercentage },
  ];

  return (
    <div className="mt-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Scorecard</div>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[560px] text-left text-[12.5px]">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
              <th className="p-2.5">Category</th>
              <th className="p-2.5">Actual</th>
              <th className="p-2.5">Target</th>
              <th className="p-2.5">%</th>
              <th className="p-2.5">Weight</th>
              <th className="p-2.5">Weighted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tier = crmPerformanceTier(row.percentage);
              const weighted = Math.round(row.percentage * CRM_CATEGORY_WEIGHT * 10) / 10;
              return (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="p-2.5 font-medium text-slate-900">{row.label}</td>
                  <td className="p-2.5 text-slate-600">{row.actual}</td>
                  <td className="p-2.5 text-slate-600">{row.target}</td>
                  <td className="p-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TIER_STYLES[tier].badge}`}>{row.percentage}%</span>
                  </td>
                  <td className="p-2.5 text-slate-600">{Math.round(CRM_CATEGORY_WEIGHT * 100)}%</td>
                  <td className="p-2.5 font-semibold text-slate-900">{weighted} pts</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProgressGoal({ label, percentage, tier }: { label: string; percentage: number; tier: CrmPerformanceTier }) {
  const style = TIER_STYLES[tier];
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        <span className={style.text}>{percentage}%</span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${style.bar} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, badgeClassName }: { label: string; value: string; badgeClassName?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      {badgeClassName ? (
        <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[15px] font-bold ${badgeClassName}`}>{value}</div>
      ) : (
        <div className="mt-1 text-[17px] font-bold text-slate-900">{value}</div>
      )}
    </div>
  );
}
