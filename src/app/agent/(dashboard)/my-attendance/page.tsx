import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { AgentAttendanceRow } from "@/lib/crm-types";
import MyAttendanceClient from "./MyAttendanceClient";

// Agent's own Daily/Weekly/Monthly attendance report - reads the same
// agent_attendance table the dashboard's Attendance card and the Admin
// Attendance page already use (migration 0043_crm_agent_attendance),
// scoped to this agent's own rows only. RLS
// (agent_attendance_agent_select_own) already enforces that on top of
// the explicit .eq below, same defense-in-depth pattern as every other
// agent-facing read in this CRM.
export default async function MyAttendancePage() {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: records, error } = await supabase
    .from("agent_attendance")
    .select("*")
    .eq("agent_id", crmUser.id)
    .order("clock_in", { ascending: false });

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">My Attendance</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Your clock-in/clock-out history by day, week, and month. Only you can see your own attendance records.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load attendance: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <MyAttendanceClient
            rows={(records ?? []) as AgentAttendanceRow[]}
            serverNowIso={new Date().toISOString()}
          />
        </div>
      )}
    </div>
  );
}
