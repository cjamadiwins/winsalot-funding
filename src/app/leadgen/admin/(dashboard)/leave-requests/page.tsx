import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import type { LeadgenLeaveRequestWithAgent, LeadgenUserRow } from "@/lib/leadgen-types";
import AdminLeadgenLeaveRequestsClient from "./AdminLeaveRequestsClient";
import {
  applyLeadgenPaidLeaveToPayrollAction,
  approveLeadgenLeaveRequestAction,
  confirmLeadgenLeaveDeductionAction,
  declineLeadgenLeaveRequestAction,
  markLeadgenLeaveAttendanceAction,
} from "./actions";

export default async function LeadgenAdminLeaveRequestsPage() {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: agents, error: agentsError }, { data: requests, error: requestsError }] = await Promise.all([
    supabase.from("leadgen_users").select("*").eq("role", "agent").order("full_name"),
    supabase
      .from("leadgen_leave_requests")
      .select("*, leadgen_users(id, full_name, email)")
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
          <AdminLeadgenLeaveRequestsClient
            agents={((agents ?? []) as LeadgenUserRow[]).map((a) => ({ id: a.id, full_name: a.full_name, email: a.email }))}
            requests={(requests ?? []) as LeadgenLeaveRequestWithAgent[]}
            approveAction={approveLeadgenLeaveRequestAction}
            declineAction={declineLeadgenLeaveRequestAction}
            markAttendanceAction={markLeadgenLeaveAttendanceAction}
            confirmDeductionAction={confirmLeadgenLeaveDeductionAction}
            applyPaidLeaveAction={applyLeadgenPaidLeaveToPayrollAction}
          />
        </div>
      )}
    </div>
  );
}
