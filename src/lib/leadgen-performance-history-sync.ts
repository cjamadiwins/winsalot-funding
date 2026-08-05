import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  addDays,
  computeLeadgenWeekBookedCount,
  leadgenDateKey,
  leadgenMondayOf,
  leadgenPerformanceTier,
  type LeadgenPerformanceAppointment,
} from "./leadgen-performance";

// A generous cap on how many completed weeks one sync call will freeze
// starting from the oldest appointment on record - not a limit on how
// much history is kept once frozen (frozen rows are never touched
// again, see migration 0051's header comment). This CRM's appointments
// table is only weeks old as of writing this, so 5 years of headroom
// means the cap will not realistically bind.
const MAX_WEEKS_PER_SYNC = 260;

// Freezes every completed (Monday strictly before the current week's
// Monday) Mon-Sun week that doesn't have a leadgen_agent_weekly_performance
// row yet, for every agent passed in - reusing the same "credited,
// not cancelled" appointments batch the caller already fetched for the
// live weekly report, so this issues no appointments query of its own.
// Insert-only (ON CONFLICT DO NOTHING via ignoreDuplicates): a week
// that's already frozen is never recomputed or overwritten, so its
// permanently saved result survives a lead - and its appointments -
// being deleted later (brief section 10, "admin ability to delete
// leads" must keep working without quietly rewriting closed history).
// Safe to call on every admin Performance page load - once a week is
// frozen there is nothing left to write, so a normal call is a cheap
// no-op read plus (usually) no insert.
export async function syncLeadgenWeeklyPerformanceHistory(
  admin: SupabaseClient,
  agents: Array<{ id: string; full_name: string | null; email: string }>,
  appointments: LeadgenPerformanceAppointment[],
  now: Date = new Date()
): Promise<void> {
  if (agents.length === 0) return;

  const todayKey = leadgenDateKey(now);
  const currentWeekStart = leadgenMondayOf(todayKey);

  let earliestWeekStart: string | null = null;
  for (const appt of appointments) {
    const weekStart = leadgenMondayOf(leadgenDateKey(appt.created_at));
    if (weekStart < currentWeekStart && (earliestWeekStart === null || weekStart < earliestWeekStart)) {
      earliestWeekStart = weekStart;
    }
  }
  if (earliestWeekStart === null) return; // no completed week to freeze yet

  const weekStarts: string[] = [];
  let cursor = earliestWeekStart;
  while (cursor < currentWeekStart && weekStarts.length < MAX_WEEKS_PER_SYNC) {
    weekStarts.push(cursor);
    cursor = addDays(cursor, 7);
  }

  const { data: existing } = await admin
    .from("leadgen_agent_weekly_performance")
    .select("agent_id, week_start")
    .gte("week_start", earliestWeekStart)
    .lt("week_start", currentWeekStart);

  const existingKeys = new Set((existing ?? []).map((row) => `${row.agent_id}|${row.week_start}`));

  const rows: Array<{
    agent_id: string;
    agent_name: string;
    week_start: string;
    week_end: string;
    booked_count: number;
    target: number;
    percentage: number;
    status: string;
  }> = [];

  for (const agent of agents) {
    const agentName = agent.full_name || agent.email;
    for (const weekStart of weekStarts) {
      if (existingKeys.has(`${agent.id}|${weekStart}`)) continue;
      const weekEnd = addDays(weekStart, 6);
      const bookedCount = computeLeadgenWeekBookedCount(appointments, agent.id, weekStart, weekEnd);
      const percentage = Math.round((bookedCount / LEADGEN_WEEKLY_APPOINTMENT_TARGET) * 100);
      rows.push({
        agent_id: agent.id,
        agent_name: agentName,
        week_start: weekStart,
        week_end: weekEnd,
        booked_count: bookedCount,
        target: LEADGEN_WEEKLY_APPOINTMENT_TARGET,
        percentage,
        status: leadgenPerformanceTier(percentage),
      });
    }
  }

  if (rows.length === 0) return;

  await admin.from("leadgen_agent_weekly_performance").upsert(rows, { onConflict: "agent_id,week_start", ignoreDuplicates: true });
}
