import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_WEEKLY_CONSULTATIONS_TARGET,
  CRM_WEEKLY_LEADS_ADDED_TARGET,
  CRM_WEEKLY_EMAILS_DELIVERED_TARGET,
  addDays,
  crmWeekStartOf,
  computeCrmPeriodPerformance,
  crmDateKey,
  crmPerformanceTier,
  type CrmPerformanceOpportunityRecord,
} from "./crm-performance";

// A generous cap on how many completed periods one sync call will
// freeze starting from the oldest opportunity on record - not a limit on
// how much history is kept once frozen (frozen rows are never touched
// again, see migration 0052's header comment). ~260 periods is roughly
// 5 years of headroom at 7 days each.
const MAX_PERIODS_PER_SYNC = 260;
const VERIFIED_DEFINITION_VERSION = 3;

// Freezes every completed (period_start strictly before the current
// period's start) Monday-Friday week that doesn't have a
// crm_agent_weekly_performance row yet, for every agent passed in -
// reusing the same opportunity records batch the caller already fetched
// for the live weekly report, so this issues no query of its own
// beyond checking what's already frozen. Insert-only (ON CONFLICT DO
// NOTHING via ignoreDuplicates): a period that's already frozen is never
// recomputed or overwritten, so its permanently saved result survives a
// later opportunity deletion - an admin can now permanently delete an
// opportunity regardless of stage, including a closed/Won one (migration
// 0104 dropped the old closed-delete-prevention trigger), so a live-only
// computation would otherwise lose that credit the moment such an
// opportunity is removed. Safe to call on every admin Performance page
// load - once a period is frozen there is nothing left to write, so a
// normal call is a cheap no-op read plus (usually) no insert.
export async function syncCrmWeeklyPerformanceHistory(
  admin: SupabaseClient,
  agents: Array<{ id: string; full_name: string | null; email: string }>,
  records: CrmPerformanceOpportunityRecord[],
  now: Date = new Date()
): Promise<void> {
  if (agents.length === 0) return;

  const currentPeriodStart = crmWeekStartOf(crmDateKey(now));

  let earliestPeriodStart: string | null = null;
  for (const record of records) {
    for (const timestamp of [
      record.createdAt,
      ...record.consultationBookings.map((booking) => booking.bookedAt),
      ...record.deliveredEmails.map((email) => email.deliveredAt),
    ]) {
      if (!timestamp) continue;
      const periodStart = crmWeekStartOf(crmDateKey(timestamp));
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
    cursor = addDays(cursor, 7);
  }

  const { data: existing } = await admin
    .from("crm_agent_weekly_performance")
    .select("agent_id, period_start")
    .eq("definition_version", VERIFIED_DEFINITION_VERSION)
    .gte("period_start", earliestPeriodStart)
    .lt("period_start", currentPeriodStart);

  const existingKeys = new Set((existing ?? []).map((row) => `${row.agent_id}|${row.period_start}`));

  const rows: Array<{
    agent_id: string;
    agent_name: string;
    period_start: string;
    period_end: string;
    consultations_booked: number;
    consultations_booked_target: number;
    consultations_booked_percentage: number;
    leads_added: number;
    leads_added_target: number;
    leads_added_percentage: number;
    emails_delivered: number;
    emails_delivered_target: number;
    emails_delivered_percentage: number;
    overall_percentage: number;
    status: string;
    definition_version: number;
  }> = [];

  for (const agent of agents) {
    const agentName = agent.full_name || agent.email;
    for (const periodStart of periodStarts) {
      if (existingKeys.has(`${agent.id}|${periodStart}`)) continue;
      const periodEnd = addDays(periodStart, 4);
      const period = computeCrmPeriodPerformance(records, agent.id, periodStart, periodEnd);
      rows.push({
        agent_id: agent.id,
        agent_name: agentName,
        period_start: periodStart,
        period_end: periodEnd,
        consultations_booked: period.consultationsBooked,
        consultations_booked_target: CRM_WEEKLY_CONSULTATIONS_TARGET,
        consultations_booked_percentage: period.consultationsPercentage,
        leads_added: period.leadsAdded,
        leads_added_target: CRM_WEEKLY_LEADS_ADDED_TARGET,
        leads_added_percentage: period.leadsAddedPercentage,
        emails_delivered: period.emailsDelivered,
        emails_delivered_target: CRM_WEEKLY_EMAILS_DELIVERED_TARGET,
        emails_delivered_percentage: period.emailsDeliveredPercentage,
        overall_percentage: period.overallPercentage,
        status: crmPerformanceTier(period.overallPercentage),
        definition_version: VERIFIED_DEFINITION_VERSION,
      });
    }
  }

  if (rows.length === 0) return;

  await admin
    .from("crm_agent_weekly_performance")
    .upsert(rows, { onConflict: "agent_id,period_start,definition_version", ignoreDuplicates: true });
}
