// Weekly Agent Incentive (Winsalot Growth CRM half): pure, client-safe
// bonus math over a batch of opportunity records, mirroring
// lib/leadgen-incentives.ts for the Lead Gen CRM. Deliberately its own
// file for the same reason crm-performance.ts is its own file, separate
// from crm-types.ts.
//
// A qualifying event is an opportunity actually won - stage = 'Client Won'
// with closed_at set (the same "Clients Won" event crm-performance.ts's
// clientsWon metric already keys off). This replaces the old "quote sent
// + admin-reviewed as Qualified" gate from the retired quote workflow -
// there's no separate admin quality-review step in the new pipeline, so a
// closed-won opportunity (which already requires a closing reason, see
// crm_opportunities_closed_reason_required in migration 0081) is itself
// the qualifying signal.
//
// Week bucketing uses closed_at (when it was won, not when the
// opportunity was originally created) in America/Toronto, Monday-Sunday -
// matching CRM_PERFORMANCE_TIMEZONE (crm-performance.ts).

import { addDays, crmDateKey, CRM_PERFORMANCE_TIMEZONE } from "./crm-performance";
import { computeWeeklyIncentiveBonus } from "./agent-incentive-shared";

export { CRM_PERFORMANCE_TIMEZONE as CRM_INCENTIVE_TIMEZONE };

export type CrmIncentiveOpportunity = {
  id: string;
  assignedAgentId: string | null; // crm_opportunities.assigned_agent_id
  stage: string;
  closedAt: string | null;
};

export function isCrmOpportunityIncentiveQualifying(
  opportunity: Pick<CrmIncentiveOpportunity, "stage" | "closedAt">
): boolean {
  return opportunity.stage === "Client Won" && opportunity.closedAt !== null;
}

export type CrmWeeklyIncentive = {
  agentId: string;
  weekStart: string; // YYYY-MM-DD, Monday
  weekEnd: string; // YYYY-MM-DD, Sunday
  qualifiedCount: number;
  quota: number;
  quotaMet: boolean;
  remainingToQuota: number;
  percentage: number; // toward the weekly quota, capped at 100
  calculatedBonus: number;
};

// Monday of the calendar week containing dateKey - same algorithm as
// leadgenMondayOf (lib/leadgen-performance.ts), duplicated here rather
// than imported since crm-performance.ts intentionally has no plain
// Monday-Sunday week concept of its own (it anchors 14-day biweekly
// periods to a fixed epoch instead - see BIWEEKLY_EPOCH_MONDAY there).
// The Weekly Incentive brief is explicitly Monday-Sunday, a different
// cadence from that existing biweekly report.
export function crmMondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, diffToMonday);
}

function creditedTo(opportunities: CrmIncentiveOpportunity[], agentId: string): CrmIncentiveOpportunity[] {
  return opportunities.filter((opportunity) => opportunity.assignedAgentId === agentId);
}

export function computeCrmWeeklyIncentive(
  opportunities: CrmIncentiveOpportunity[],
  agentId: string,
  weekStart: string,
  weekEnd: string,
  weeklyQuota: number,
  weeklyBonusAmount: number
): CrmWeeklyIncentive {
  const qualifiedCount = creditedTo(opportunities, agentId).filter((opportunity) => {
    if (!isCrmOpportunityIncentiveQualifying(opportunity)) return false;
    const key = crmDateKey(opportunity.closedAt as string);
    return key >= weekStart && key <= weekEnd;
  }).length;

  const { quotaMet, calculatedBonus } = computeWeeklyIncentiveBonus(qualifiedCount, weeklyQuota, weeklyBonusAmount);

  return {
    agentId,
    weekStart,
    weekEnd,
    qualifiedCount,
    quota: weeklyQuota,
    quotaMet,
    remainingToQuota: Math.max(0, weeklyQuota - qualifiedCount),
    percentage: Math.min(100, Math.round((qualifiedCount / weeklyQuota) * 100)),
    calculatedBonus,
  };
}

export function crmCurrentIncentiveWeek(now: Date = new Date()): { weekStart: string; weekEnd: string } {
  const weekStart = crmMondayOf(crmDateKey(now));
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export type CrmWeeklyRecordCounts = {
  rawCount: number; // every opportunity credited to this agent and closed during the week, won or lost
  rejectedCount: number; // closed during the week as Not Interested (lost), not Client Won
};

// Admin table's "Raw Total"/"Rejected" columns - purely descriptive
// counts alongside computeCrmWeeklyIncentive's qualifiedCount (the
// "Verified" column); never feeds into the bonus calculation. Bucketed
// the same way as computeCrmWeeklyIncentive (closedAt within the week) -
// an opportunity that was never closed has no closed date and so cannot
// belong to any week here.
export function computeCrmWeeklyRecordCounts(
  opportunities: CrmIncentiveOpportunity[],
  agentId: string,
  weekStart: string,
  weekEnd: string
): CrmWeeklyRecordCounts {
  const inWeek = creditedTo(opportunities, agentId).filter((opportunity) => {
    if (!opportunity.closedAt) return false;
    const key = crmDateKey(opportunity.closedAt);
    return key >= weekStart && key <= weekEnd;
  });
  let rejectedCount = 0;
  for (const opportunity of inWeek) {
    if (opportunity.stage === "Not Interested") rejectedCount++;
  }
  return { rawCount: inWeek.length, rejectedCount };
}
