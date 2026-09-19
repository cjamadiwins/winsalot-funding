import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenAgentAttendanceRow, LeadgenAgentIdleSessionRow, LeadgenUserRow } from "@/lib/leadgen-types";
import LeadgenAdminAttendanceClient from "./LeadgenAdminAttendanceClient";

export default async function LeadgenAdminAttendancePage() {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: attendance, error: attendanceError }, { data: agents, error: agentsError }, { data: idleAcknowledgments }] = await Promise.all([
    supabase.from("leadgen_agent_attendance").select("*").order("clock_in", { ascending: false }),
    supabase
      .from("leadgen_users")
      .select("*")
      .eq("role", "agent")
      .eq("active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("leadgen_agent_idle_sessions")
      .select("*")
      .not("acknowledged_at", "is", null)
      .order("acknowledged_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
      <p className="mt-1 text-sm text-slate-500">Daily clock-in and clock-out records for all leadgen agents.</p>

      {(attendanceError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load attendance: {(attendanceError ?? agentsError)?.message}
        </p>
      )}

      {!attendanceError && !agentsError && (
        <div className="mt-6">
          <LeadgenAdminAttendanceClient
            attendance={(attendance ?? []) as LeadgenAgentAttendanceRow[]}
            agents={(agents ?? []) as LeadgenUserRow[]}
            idleAcknowledgments={(idleAcknowledgments ?? []) as LeadgenAgentIdleSessionRow[]}
          />
        </div>
      )}
    </div>
  );
}