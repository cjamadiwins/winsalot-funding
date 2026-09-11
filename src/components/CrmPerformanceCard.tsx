import { CalendarCheck, Target, Mail } from "lucide-react";
import type { CrmAgentPerformance, CrmWeeklyPeriodPerformance, CrmPerformanceTier } from "@/lib/crm-performance";
import {
  CRM_WEEKLY_CONSULTATIONS_TARGET,
  CRM_WEEKLY_LEADS_ADDED_TARGET,
  CRM_WEEKLY_EMAILS_DELIVERED_TARGET,
  CRM_CATEGORY_WEIGHT,
  crmWeeklyRangeLabel,
  crmPerformanceTier,
} from "@/lib/crm-performance";
import { GROWTH_CRM_GAUGE_SEGMENTS, PERFORMANCE_BAND_STYLES } from "@/components/crm-ui/PerformanceRing";
import PerformanceScoreCard, { PerformanceTile } from "@/components/crm-ui/PerformanceScoreCard";

// One color per tier, shared by every percentage badge and progress bar
// for a given metric so they never disagree with the gauge's own bands
// (0-39 red, 40-59 yellow/amber, 60-79 green, 80-100 blue - see
// crmPerformanceTier). Sourced from the gauge's own PERFORMANCE_BAND_STYLES
// so this card can never drift from the ring it sits next to.
const TIER_STYLES = PERFORMANCE_BAND_STYLES;

// Renders one agent's weekly Agent Performance Report card - shared by
// the admin's "every agent" view (/admin/crm/performance) and an agent's
// own "just me" view (/agent/performance), so the two can never drift out
// of sync with each other.
export default function CrmPerformanceCard({ agentName, performance }: { agentName: string; performance: CrmAgentPerformance }) {
  const { current, history } = performance;
  const overallTier = crmPerformanceTier(current.overallPercentage);

  return (
    <PerformanceScoreCard
      agentName={agentName}
      score={current.overallPercentage}
      tier={overallTier}
      segments={GROWTH_CRM_GAUGE_SEGMENTS}
      gaugeSize={260}
      strokeWidth={15}
      periodLabel={`Week: ${crmWeeklyRangeLabel(current.periodStart, current.periodEnd)}`}
      resultsLine={`${current.consultationsBooked} consultations · ${current.leadsAdded} leads added · ${current.emailsDelivered} emails delivered`}
      tiles={
        <>
          <PerformanceTile
            label="Consultations Booked"
            value={`${current.consultationsBooked}/${CRM_WEEKLY_CONSULTATIONS_TARGET}`}
            icon={<CalendarCheck className="h-5 w-5" strokeWidth={2.3} />}
            tone="violet"
          />
          <PerformanceTile
            label="Opportunity Leads Added"
            value={`${current.leadsAdded}/${CRM_WEEKLY_LEADS_ADDED_TARGET}`}
            icon={<Target className="h-5 w-5" strokeWidth={2.3} />}
            tone="emerald"
          />
          <PerformanceTile
            label="Emails Delivered"
            value={`${current.emailsDelivered}/${CRM_WEEKLY_EMAILS_DELIVERED_TARGET}`}
            icon={<Mail className="h-5 w-5" strokeWidth={2.3} />}
            tone="sky"
          />
        </>
      }
    >
      <WeeklyProgress period={current} />
      <ScorecardTable period={current} />

      {history.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Previous Weeks</div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[520px] text-left text-[12.5px]">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                  <th className="p-2.5">Week</th>
                  <th className="p-2.5">Consultations</th>
                  <th className="p-2.5">Leads Added</th>
                  <th className="p-2.5">Emails Delivered</th>
                  <th className="p-2.5">Overall</th>
                </tr>
              </thead>
              <tbody>
                {history.map((period) => {
                  const tier = crmPerformanceTier(period.overallPercentage);
                  return (
                    <tr key={period.periodStart} className="border-b border-slate-100 last:border-0">
                      <td className="p-2.5 text-slate-600">{crmWeeklyRangeLabel(period.periodStart, period.periodEnd)}</td>
                      <td className="p-2.5 font-medium text-slate-900">
                        {period.consultationsBooked}/{CRM_WEEKLY_CONSULTATIONS_TARGET}
                      </td>
                      <td className="p-2.5 font-medium text-slate-900">
                        {period.leadsAdded}/{CRM_WEEKLY_LEADS_ADDED_TARGET}
                      </td>
                      <td className="p-2.5 font-medium text-slate-900">
                        {period.emailsDelivered}/{CRM_WEEKLY_EMAILS_DELIVERED_TARGET}
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
    </PerformanceScoreCard>
  );
}

function WeeklyProgress({ period }: { period: CrmWeeklyPeriodPerformance }) {
  const consultationsTier = crmPerformanceTier(period.consultationsPercentage);
  const leadsAddedTier = crmPerformanceTier(period.leadsAddedPercentage);
  const emailsDeliveredTier = crmPerformanceTier(period.emailsDeliveredPercentage);

  return (
    <div className="mt-6">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Weekly Progress</div>
      <ProgressGoal label="Consultations Booked Progress" percentage={period.consultationsPercentage} tier={consultationsTier} />
      <ProgressGoal label="Opportunity Leads Added Progress" percentage={period.leadsAddedPercentage} tier={leadsAddedTier} />
      <ProgressGoal label="Emails Delivered Progress" percentage={period.emailsDeliveredPercentage} tier={emailsDeliveredTier} />
    </div>
  );
}

// The scorecard behind the gauge's centre score: each category's actual
// result, target, achievement percentage (capped at 100%), fixed 1/3
// weight, and weighted contribution (percentage x weight) - the three
// weighted contributions are exactly what sum to the gauge's overall
// score, so this table is the arithmetic the gauge is showing, made
// visible. The actual count is never capped (so an agent who exceeds a
// target still sees their real number) - only the achievement percentage
// and progress bar width are capped at 100%.
function ScorecardTable({ period }: { period: CrmWeeklyPeriodPerformance }) {
  const rows: Array<{ label: string; actual: number; target: number; percentage: number }> = [
    { label: "Opportunity Leads Added", actual: period.leadsAdded, target: CRM_WEEKLY_LEADS_ADDED_TARGET, percentage: period.leadsAddedPercentage },
    { label: "Emails Delivered", actual: period.emailsDelivered, target: CRM_WEEKLY_EMAILS_DELIVERED_TARGET, percentage: period.emailsDeliveredPercentage },
    { label: "Consultations Booked", actual: period.consultationsBooked, target: CRM_WEEKLY_CONSULTATIONS_TARGET, percentage: period.consultationsPercentage },
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
