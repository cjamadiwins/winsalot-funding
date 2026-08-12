// Weekly Agent Incentive (Cleaning CRM half): pure, client-safe bonus
// math over a batch of quote records, mirroring lib/leadgen-incentives.ts
// for the Lead Gen CRM. Deliberately its own file for the same reason
// crm-performance.ts is its own file, separate from crm-types.ts.
//
// Unlike a leadgen_appointment, a quote_requests row has no agent column
// of its own (assigned_provider_id links to a cleaning company, not a
// CRM agent) - agent credit comes from crm_leads.assigned_agent_id, the
// exact same "credited agent" the existing Agent Performance Report
// already uses (see crm-performance.ts's header comment). A quote only
// counts once, toward at most one agent, because it is only ever
// attached to at most one crm_leads row (crm_leads.quote_request_id is
// a plain FK, not many-to-many).
//
// A quote counts toward the weekly quota only when BOTH:
//   1. It was actually sent to the customer - customer_quote_sent_at is
//      not null (the same "Sent Quote to Customer" event
//      crm-performance.ts's quotesSent already keys off).
//   2. An admin has reviewed it as incentive_status = 'Qualified'
//      (migration 0058) - never Draft/Cancelled/Invalid/Duplicate/Test,
//      and never a quote nobody has reviewed yet (null).
//
// Week bucketing uses customer_quote_sent_at (when it was sent, not when
// the quote request was originally created) in America/Toronto, Monday-
// Sunday - matching CRM_PERFORMANCE_TIMEZONE (crm-performance.ts).

import { addDays, crmDateKey, CRM_PERFORMANCE_TIMEZONE } from "./crm-performance";
import { computeWeeklyIncentiveBonus } from "./agent-incentive-shared";
import type { QuoteIncentiveStatus } from "./admin-types";

export { CRM_PERFORMANCE_TIMEZONE as CRM_INCENTIVE_TIMEZONE };

export type CrmIncentiveQuote = {
  id: string;
  assignedAgentId: string | null; // crm_leads.assigned_agent_id for the lead this quote belongs to
  customerQuoteSentAt: string | null;
  incentiveStatus: QuoteIncentiveStatus | null;
};

export function isCrmQuoteIncentiveQualifying(quote: Pick<CrmIncentiveQuote, "customerQuoteSentAt" | "incentiveStatus">): boolean {
  return quote.customerQuoteSentAt !== null && quote.incentiveStatus === "Qualified";
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

function creditedTo(quotes: CrmIncentiveQuote[], agentId: string): CrmIncentiveQuote[] {
  return quotes.filter((quote) => quote.assignedAgentId === agentId);
}

export function computeCrmWeeklyIncentive(
  quotes: CrmIncentiveQuote[],
  agentId: string,
  weekStart: string,
  weekEnd: string,
  weeklyQuota: number,
  weeklyBonusAmount: number
): CrmWeeklyIncentive {
  const qualifiedCount = creditedTo(quotes, agentId).filter((quote) => {
    if (!isCrmQuoteIncentiveQualifying(quote)) return false;
    const key = crmDateKey(quote.customerQuoteSentAt as string);
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
