import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenLeaveRequestRow } from "@/lib/leadgen-types";
import LeadgenLeaveRequestsClient from "./LeaveRequestsClient";

export default async function LeadgenAgentLeaveRequestsPage() {
  const leadgenUser = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_leave_requests_agent_select_own, migration 0070)
  // already restricts this to the caller's own rows; the explicit
  // agent_id filter below is defense in depth, same pattern as the rest
  // of this CRM.
  const { data: requests, error } = await supabase
    .from("leadgen_leave_requests")
    .select("*")
    .eq("agent_id", leadgenUser.id)
    .order("submitted_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Leave Requests</h1>
      <p className="mt-1 text-sm text-slate-500">Submit and track your leave requests.</p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load your leave requests: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <LeadgenLeaveRequestsClient requests={(requests ?? []) as LeadgenLeaveRequestRow[]} />
        </div>
      )}
    </div>
  );
}
