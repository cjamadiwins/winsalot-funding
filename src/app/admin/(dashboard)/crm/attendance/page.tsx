import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { AgentAttendanceRow, AgentIdleSessionRow, CrmUserRow } from "@/lib/crm-types";
import AdminAttendanceClient from "./AdminAttendanceClient";

export default async function AdminAttendancePage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: attendance, error: attendanceError }, { data: agents, error: agentsError }, { data: idleAcknowledgments }] =
    await Promise.all([
      supabase.from("agent_attendance").select("*").order("clock_in", { ascending: false }),
      supabase
        .from("crm_users")
        .select("*")
        .eq("role", "agent")
        .order("full_name", { ascending: true }),
      // Admin's idle-acknowledgment history (RLS: admin select-all on
      // agent_idle_sessions) - only ever acknowledged rows, most recent
      // first, per the brief's "Admin history" section.
      supabase
        .from("agent_idle_sessions")
        .select("*")
        .not("acknowledged_at", "is", null)
        .order("acknowledged_at", { ascending: false })
        .limit(200),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Agent Attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Clock-in and clock-out records across all agents.
      </p>

      {(attendanceError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load attendance: {(attendanceError ?? agentsError)?.message}
        </p>
      )}

      {!attendanceError && !agentsError && (
        <div className="mt-6">
          <AdminAttendanceClient
            attendance={(attendance ?? []) as AgentAttendanceRow[]}
            agents={(agents ?? []) as CrmUserRow[]}
            idleAcknowledgments={(idleAcknowledgments ?? []) as AgentIdleSessionRow[]}
          />
        </div>
      )}
    </div>
  );
}
