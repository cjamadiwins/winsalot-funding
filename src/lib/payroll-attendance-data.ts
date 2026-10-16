import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  mergeAttendanceSources,
  SPAN_LOOKBACK_DAYS,
  type AttendanceSource,
  type PayrollShiftRow,
  type SourcedShiftRow,
} from "./payroll-attendance";

// The single read path behind "Refresh Attendance" in BOTH CRMs. An agent is
// identified by their stable user id (the same uuid in crm_users and
// leadgen_users for people who work in both), never by name or email, and
// attendance is read from BOTH attendance tables so a person who clocks in
// through the other CRM is still paid for those days.
//
// Strictly read-only: it only SELECTs, never alters an attendance record.
// Callers must already have verified the signed-in user is a payroll admin;
// the service client is used only because each CRM's RLS lets an admin read
// just their own CRM's attendance table.
export type PayrollAttendanceLoad = {
  rows: SourcedShiftRow[];
  scheduledStartTime: string | null;
  sourceCounts: Record<AttendanceSource, number>;
  duplicatesRemoved: number;
};

function utcDayOffset(isoDate: string, days: number, endOfDay = false): string {
  const date = new Date(`${isoDate}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export async function loadPayrollAttendance(
  agentId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ error?: string; data?: PayrollAttendanceLoad }> {
  const db = getSupabaseAdmin();
  // Padded by a day each side for the UTC/Toronto boundary (exact per-day
  // bucketing happens in analyzePayPeriod), and further back so a long record
  // that began before the period but runs into it is still seen and flagged.
  const from = utcDayOffset(periodStart, -SPAN_LOOKBACK_DAYS);
  const to = utcDayOffset(periodEnd, 1, true);

  const [growth, leadgen, growthUser, leadgenUser] = await Promise.all([
    db.from("agent_attendance").select("*").eq("agent_id", agentId).gte("clock_in", from).lte("clock_in", to).order("clock_in", { ascending: true }),
    db.from("leadgen_agent_attendance").select("*").eq("agent_id", agentId).gte("clock_in", from).lte("clock_in", to).order("clock_in", { ascending: true }),
    db.from("crm_users").select("scheduled_start_time").eq("id", agentId).maybeSingle(),
    db.from("leadgen_users").select("scheduled_start_time").eq("id", agentId).maybeSingle(),
  ]);

  if (growth.error) return { error: `Failed to load Growth CRM attendance: ${growth.error.message}` };
  if (leadgen.error) return { error: `Failed to load Lead Generation CRM attendance: ${leadgen.error.message}` };

  const growthRows = (growth.data ?? []) as PayrollShiftRow[];
  const leadgenRows = (leadgen.data ?? []) as PayrollShiftRow[];
  // Lead Generation first: it holds the agents' current attendance, so it
  // wins a tie when the same clock-in exists in both tables.
  const merged = mergeAttendanceSources<SourcedShiftRow>([
    { source: "leadgen", rows: leadgenRows },
    { source: "growth", rows: growthRows },
  ]);

  return {
    data: {
      rows: merged.rows,
      scheduledStartTime: leadgenUser.data?.scheduled_start_time ?? growthUser.data?.scheduled_start_time ?? null,
      sourceCounts: { growth: growthRows.length, leadgen: leadgenRows.length },
      duplicatesRemoved: merged.duplicatesRemoved.length,
    },
  };
}
