import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_BIWEEKLY_QUOTES_RECEIVED_TARGET,
  CRM_BIWEEKLY_QUOTES_SENT_TARGET,
  addDays,
  biweeklyPeriodStartOf,
  computeCrmPeriodPerformance,
  crmDateKey,
  crmPerformanceTier,
  type CrmPerformanceQuoteRecord,
} from "./crm-performance";

// A generous cap on how many completed periods one sync call will
// freeze starting from the oldest quote on record - not a limit on how
// much history is kept once frozen (frozen rows are never touched
// again, see migration 0052's header comment). ~130 periods is roughly
// 5 years of headroom at 14 days each.
const MAX_PERIODS_PER_SYNC = 130;

// Freezes every completed (period_start strictly before the current
// period's start) two-week period that doesn't have a
// crm_agent_biweekly_performance row yet, for every agent passed in -
// reusing the same quote records batch the caller already fetched for
// the live biweekly report, so this issues no query of its own beyond
// checking what's already frozen. Insert-only (ON CONFLICT DO NOTHING
// via ignoreDuplicates): a period that's already frozen is never
// recomputed or overwritten, so its permanently saved result survives a
// lead being deleted later (brief: don't break "admin ability to delete
// leads"; only non-closed leads can be deleted at all - closed ones are
// protected by crm_leads_prevent_closed_delete_trigger, migration 0024
// - but a non-closed lead can still carry quote-sent/received credit
// that a live-only computation would lose). Safe to call on every admin
// Performance page load - once a period is frozen there is nothing left
// to write, so a normal call is a cheap no-op read plus (usually) no
// insert.
export async function syncCrmBiweeklyPerformanceHistory(
  admin: SupabaseClient,
  agents: Array<{ id: string; full_name: string | null; email: string }>,
  records: CrmPerformanceQuoteRecord[],
  now: Date = new Date()
): Promise<void> {
  if (agents.length === 0) return;

  const currentPeriodStart = biweeklyPeriodStartOf(crmDateKey(now));

  let earliestPeriodStart: string | null = null;
  for (const record of records) {
    for (const timestamp of [record.quoteSentAt, record.quoteReceivedAt]) {
      if (!timestamp) continue;
      const periodStart = biweeklyPeriodStartOf(crmDateKey(timestamp));
      if (periodStart < currentPeriodStart && (earliestPeriodStart === null || periodStart < earliestPeriodStart)) {
        earliestPeriodStart = periodStart;
      }
    }
  }
  if (earliestPeriodStart === null) return; // no completed period to freeze yet

  const periodStarts: string[] = [];
  let cursor = earliestPeriodStart;
  while (cursor < currentPeriodStart && periodStarts.length < MAX_PERIODS_PER_SYNC) {
    periodStarts.push(cursor);
    cursor = addDays(cursor, 14);
  }

  const { data: existing } = await admin
    .from("crm_agent_biweekly_performance")
    .select("agent_id, period_start")
    .gte("period_start", earliestPeriodStart)
    .lt("period_start", currentPeriodStart);

  const existingKeys = new Set((existing ?? []).map((row) => `${row.agent_id}|${row.period_start}`));

  const rows: Array<{
    agent_id: string;
    agent_name: string;
    period_start: string;
    period_end: string;
    quotes_sent: number;
    quotes_sent_target: number;
    quotes_sent_percentage: number;
    quotes_received: number;
    quotes_received_target: number;
    quotes_received_percentage: number;
    overall_percentage: number;
    status: string;
  }> = [];

  for (const agent of agents) {
    const agentName = agent.full_name || agent.email;
    for (const periodStart of periodStarts) {
      if (existingKeys.has(`${agent.id}|${periodStart}`)) continue;
      const periodEnd = addDays(periodStart, 13);
      const period = computeCrmPeriodPerformance(records, agent.id, periodStart, periodEnd);
      rows.push({
        agent_id: agent.id,
        agent_name: agentName,
        period_start: periodStart,
        period_end: periodEnd,
        quotes_sent: period.quotesSent,
        quotes_sent_target: CRM_BIWEEKLY_QUOTES_SENT_TARGET,
        quotes_sent_percentage: period.sentPercentage,
        quotes_received: period.quotesReceived,
        quotes_received_target: CRM_BIWEEKLY_QUOTES_RECEIVED_TARGET,
        quotes_received_percentage: period.receivedPercentage,
        overall_percentage: period.overallPercentage,
        status: crmPerformanceTier(period.overallPercentage),
      });
    }
  }

  if (rows.length === 0) return;

  await admin.from("crm_agent_biweekly_performance").upsert(rows, { onConflict: "agent_id,period_start", ignoreDuplicates: true });
}
