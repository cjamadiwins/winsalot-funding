import Link from "next/link";
import { formatNgn } from "@/lib/payroll";
import {
  WEEKLY_INCENTIVE_DISPLAY_STATUS_LABEL,
  WEEKLY_INCENTIVE_DISPLAY_STATUS_STYLES,
  type WeeklyIncentiveDisplayStatus,
  type WinsalotIncentiveCrm,
} from "@/lib/agent-incentive-shared";
import PerformanceRing from "@/components/crm-ui/PerformanceRing";
import IncentiveRulesPanel from "@/components/crm-ui/IncentiveRulesPanel";

// One line of plain-language guidance per display status (brief's
// example messages) - kept here, next to the status derivation this
// reads, so the two can never say contradictory things.
function statusMessage(status: WeeklyIncentiveDisplayStatus, remainingToQuota: number, recordLabel: string, weeklyBonusAmount: string): string {
  switch (status) {
    case "in_progress":
      return remainingToQuota > 0
        ? `You need ${remainingToQuota} more ${recordLabel} to reach this week's quota.`
        : `Keep going to reach this week's quota.`;
    case "awaiting_review":
      return `Weekly quota achieved. Your ${weeklyBonusAmount} incentive is awaiting admin review.`;
    case "approved":
      return `Your ${weeklyBonusAmount} weekly incentive has been approved.`;
    case "rejected":
      return `This week's incentive was reviewed and not approved. See your incentive history for details.`;
    case "paid":
      return `Your ${weeklyBonusAmount} weekly incentive has been paid.`;
    default:
      return "";
  }
}

// Weekly Agent Incentive card - shared by both CRMs' agent dashboards
// (leadgen/agent/page.tsx and agent/page.tsx), the same way KpiCard and
// PerformanceRing already are, so the two can never drift out of sync
// with each other on layout or field list. Renders only the numbers the
// calling page computed for the signed-in agent - never fetches
// anything itself, so it cannot leak another agent's data regardless of
// what it's given. Enhancement over the original card: a richer
// in_progress/awaiting_review/approved/rejected/paid status (see
// lib/agent-incentive-shared.ts's deriveWeeklyIncentiveDisplayStatus -
// purely a display derivation, the underlying qualifiedCount/
// calculatedBonus math is unchanged), a cap-reached banner, a link to
// the agent's incentive history, and an embedded "View Incentive Rules"
// panel - the calculation inputs/outputs (qualifiedCount, quota,
// percentage, calculatedBonus) are still exactly what the caller passed
// before.
export default function AgentWeeklyIncentiveCard({
  crm,
  weekLabel,
  recordLabel,
  qualifiedCount,
  quota,
  percentage,
  quotaMet,
  calculatedBonus,
  weeklyBonusAmount,
  displayStatus,
  monthLabel,
  monthToDateApproved,
  monthlyCap,
  remainingToCap,
  capReached,
  historyHref,
}: {
  crm: WinsalotIncentiveCrm;
  weekLabel: string;
  recordLabel: string; // "qualified appointments" or "qualified consultations"
  qualifiedCount: number;
  quota: number;
  percentage: number;
  quotaMet: boolean;
  calculatedBonus: number;
  weeklyBonusAmount: number;
  displayStatus: WeeklyIncentiveDisplayStatus;
  monthLabel: string;
  monthToDateApproved: number;
  monthlyCap: number;
  remainingToCap: number;
  capReached: boolean;
  historyHref: string;
}) {
  const tier = quotaMet ? "green" : percentage >= 40 ? "yellow" : "red";
  const remainingToQuota = Math.max(0, quota - qualifiedCount);
  const message = statusMessage(displayStatus, remainingToQuota, recordLabel, formatNgn(weeklyBonusAmount));

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Weekly Incentive</h2>
        <span className="text-[12px] text-slate-500">Current incentive week (Mon–Sun): {weekLabel}</span>
      </div>

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <PerformanceRing percentage={percentage} tier={tier} label="of weekly quota" />
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label={`This Week's ${recordLabel}`} value={String(qualifiedCount)} />
          <Stat label="Weekly Quota" value={String(quota)} />
          <Stat label="Still Required" value={String(remainingToQuota)} />
          <Stat label="Weekly Bonus Available" value={formatNgn(weeklyBonusAmount)} />
          <Stat label="This Week's Result" value={formatNgn(calculatedBonus)} />
        </div>
      </div>

      <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-600">{message}</p>

      {capReached && displayStatus !== "paid" && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-amber-800">
          ⚠ Your monthly incentive cap of {formatNgn(monthlyCap)} has been reached.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Status</div>
          <div className="mt-1.5">
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${WEEKLY_INCENTIVE_DISPLAY_STATUS_STYLES[displayStatus]}`}>
              {WEEKLY_INCENTIVE_DISPLAY_STATUS_LABEL[displayStatus]}
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

      <div className="mt-4">
        <Link href={historyHref} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
          View my weekly incentive history →
        </Link>
      </div>

      <IncentiveRulesPanel crm={crm} audience="agent" />
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
