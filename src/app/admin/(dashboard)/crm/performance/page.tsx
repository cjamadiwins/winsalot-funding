import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { biweeklyPeriodStartOf, computeCrmAgentPerformance, crmDateKey } from "@/lib/crm-performance";
import { syncCrmBiweeklyPerformanceHistory } from "@/lib/crm-performance-history-sync";
import type { CrmBiweeklyHistoryRow } from "@/lib/crm-performance-history";
import type { CrmUserRow } from "@/lib/crm-types";
import CrmPerformanceCard from "@/components/CrmPerformanceCard";
import CrmMonthlyPerformanceSection from "@/components/CrmMonthlyPerformanceSection";

// Admin view of the Winsalot Growth CRM's Agent Performance Report -
// every active agent, each with their own biweekly-target card (see
// CrmPerformanceCard). Agents only ever see their own card -
// /agent/performance. Below the unchanged biweekly cards,
// CrmMonthlyPerformanceSection adds the Monthly Performance history
// view, reading the permanent biweekly ledger this page keeps in sync
// (see crm-performance-history-sync.ts).
export default async function AdminCrmPerformancePage() {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();

  const [{ data: agents }, records] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true).order("full_name"),
    getCrmPerformanceRecords(),
  ]);

  const allAgents = (agents ?? []) as Pick<CrmUserRow, "id" | "full_name" | "email">[];

  const now = new Date();
  await syncCrmBiweeklyPerformanceHistory(admin, allAgents, records, now);

  const { data: historyRows } = await admin
    .from("crm_agent_biweekly_performance")
    .select(
      "agent_id, agent_name, period_start, period_end, consultations_booked, consultations_booked_target, consultations_booked_percentage, qualified_opportunities, qualified_opportunities_target, qualified_opportunities_percentage, applications_submitted, applications_submitted_target, applications_submitted_percentage, proposals_sent, proposals_sent_target, proposals_sent_percentage, clients_won, clients_won_target, clients_won_percentage, overall_percentage, status"
    )
    .in("agent_id", allAgents.map((agent) => agent.id));

  const todayKey = crmDateKey(now);
  const currentPeriodStart = biweeklyPeriodStartOf(todayKey);
  const [currentYear, currentMonth] = todayKey.split("-").map(Number);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Agent Performance Report</h1>
      <p className="mt-1 text-sm text-slate-500">
        Biweekly performance against five targets per agent, reset every two weeks: consultations booked, qualified opportunities,
        applications submitted, proposals sent, and clients won.
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

      <CrmMonthlyPerformanceSection
        agents={allAgents.map((agent) => ({ id: agent.id, name: agent.full_name || agent.email }))}
        records={records}
        historyRows={(historyRows ?? []) as CrmBiweeklyHistoryRow[]}
        currentPeriodStart={currentPeriodStart}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
    </div>
  );
}
