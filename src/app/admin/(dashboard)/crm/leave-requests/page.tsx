import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmLeaveRequestWithAgent, CrmUserRow } from "@/lib/crm-types";
import AdminLeaveRequestsClient from "./AdminLeaveRequestsClient";
import {
  applyPaidLeaveToPayrollAction,
  approveLeaveRequestAction,
  confirmLeaveDeductionAction,
  declineLeaveRequestAction,
  markLeaveAttendanceAction,
} from "./actions";

export default async function AdminLeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  await requireCrmAdmin();
  const { highlight } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: agents, error: agentsError }, { data: requests, error: requestsError }] = await Promise.all([
    supabase.from("crm_users").select("*").eq("role", "agent").order("full_name"),
    supabase
      .from("crm_leave_requests")
      // crm_leave_requests has four FK columns to crm_users (agent_id,
      // decided_by, attendance_marked_by, deduction_confirmed_by) - the
      // `!agent_id` hint tells PostgREST which one to embed through,
      // since an unqualified `crm_users(...)` is ambiguous with more
      // than one relationship to the same table.
      .select("*, crm_users!agent_id(id, full_name, email)")
      .order("submitted_at", { ascending: false }),
  ]);

  const error = agentsError ?? requestsError;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Leave Requests</h1>
      <p className="mt-1 text-sm text-slate-500">
        Review, approve, and decline agent leave requests, and connect decisions to attendance and payroll.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load leave requests: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <AdminLeaveRequestsClient
            agents={((agents ?? []) as CrmUserRow[]).map((a) => ({ id: a.id, full_name: a.full_name, email: a.email }))}
            requests={(requests ?? []) as CrmLeaveRequestWithAgent[]}
            highlightId={highlight}
            approveAction={approveLeaveRequestAction}
            declineAction={declineLeaveRequestAction}
            markAttendanceAction={markLeaveAttendanceAction}
            confirmDeductionAction={confirmLeaveDeductionAction}
            applyPaidLeaveAction={applyPaidLeaveToPayrollAction}
          />
        </div>
      )}
    </div>
  );
}
