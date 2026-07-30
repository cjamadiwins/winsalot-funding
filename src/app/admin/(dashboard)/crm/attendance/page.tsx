import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmAttendanceRow, CrmUserRow } from "@/lib/crm-types";
import AttendanceAdminClient from "./AttendanceAdminClient";

export default async function AdminCrmAttendancePage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_attendance_admin_all / crm_users_admin_select_all) permits a
  // full read here because this page is already gated by requireCrmAdmin().
  const [
    { data: records, error: recordsError },
    { data: agents, error: agentsError },
  ] = await Promise.all([
    supabase.from("crm_attendance").select("*").order("clock_in_at", { ascending: false }),
    supabase.from("crm_users").select("*").order("full_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
      <p className="mt-1 text-sm text-slate-500">Clock in/out history for every agent.</p>

      {(recordsError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load attendance: {(recordsError ?? agentsError)?.message}
        </p>
      )}

      {!recordsError && !agentsError && (
        <div className="mt-6">
          <AttendanceAdminClient
            records={(records ?? []) as CrmAttendanceRow[]}
            agents={(agents ?? []) as CrmUserRow[]}
          />
        </div>
      )}
    </div>
  );
}
