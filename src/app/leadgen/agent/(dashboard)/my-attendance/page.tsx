import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import type { LeadgenAgentAttendanceRow } from "@/lib/leadgen-types";
import LeadgenMyAttendanceClient from "./LeadgenMyAttendanceClient";

// Agent's own Daily/Weekly/Monthly attendance report - reads the same
// leadgen_agent_attendance table the dashboard's Attendance card and the
// Admin Attendance page already use (migration
// 0044_leadgen_agent_attendance), scoped to this agent's own rows only.
// RLS (leadgen_agent_attendance_agent_select_own) already enforces that
// on top of the explicit .eq below, same defense-in-depth pattern as
// every other agent-facing read in this CRM.
export default async function LeadgenMyAttendancePage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: records, error } = await supabase
    .from("leadgen_agent_attendance")
    .select("*")
    .eq("agent_id", agent.id)
    .order("clock_in", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your clock-in/clock-out history by day, week, and month. Only you can see your own attendance records.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load attendance: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <LeadgenMyAttendanceClient
            rows={(records ?? []) as LeadgenAgentAttendanceRow[]}
            serverNowIso={new Date().toISOString()}
          />
        </div>
      )}
    </div>
  );
}
