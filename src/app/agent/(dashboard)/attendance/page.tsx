import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { CrmAttendanceRow } from "@/lib/crm-types";
import AttendanceClient from "./AttendanceClient";

export default async function AgentAttendancePage() {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_attendance_agent_select_own, migration 0043) already
  // restricts this to the signed-in agent's own rows, same as every other
  // agent-facing read in this CRM.
  const { data: records, error } = await supabase
    .from("crm_attendance")
    .select("*")
    .order("clock_in_at", { ascending: false });

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">
        Attendance
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Clock in and out to record your hours. Only you can see your own attendance history.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load attendance: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <AttendanceClient
            records={(records ?? []) as CrmAttendanceRow[]}
            agentName={crmUser.full_name || crmUser.email}
          />
        </div>
      )}
    </div>
  );
}
