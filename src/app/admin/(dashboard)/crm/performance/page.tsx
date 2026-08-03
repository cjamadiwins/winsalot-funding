import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { computeCrmAgentPerformance } from "@/lib/crm-performance";
import type { CrmUserRow } from "@/lib/crm-types";
import CrmPerformanceCard from "@/components/CrmPerformanceCard";

// Admin view of the Cleaning CRM's Agent Performance Report - every active
// agent, each with their own biweekly-target card (see
// CrmPerformanceCard). Agents only ever see their own card -
// /agent/performance.
export default async function AdminCrmPerformancePage() {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();

  const [{ data: agents }, records] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true).order("full_name"),
    getCrmPerformanceRecords(),
  ]);

  const allAgents = (agents ?? []) as Pick<CrmUserRow, "id" | "full_name" | "email">[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Agent Performance Report</h1>
      <p className="mt-1 text-sm text-slate-500">
        Biweekly performance against a target of 4 quotes sent and 1 quote received per agent, reset every two weeks. A quote counts as
        sent only once it&apos;s sent to the customer, and received only once a provider submits a completed price - credited to whichever
        agent is handling that customer, not whoever submitted it.
      </p>

      <div className="mt-6 space-y-6">
        {allAgents.length === 0 ? (
          <p className="text-[13.5px] text-slate-500">No active agents yet.</p>
        ) : (
          allAgents.map((agent) => (
            <CrmPerformanceCard key={agent.id} agentName={agent.full_name || agent.email} performance={computeCrmAgentPerformance(records, agent.id)} />
          ))
        )}
      </div>
    </div>
  );
}
