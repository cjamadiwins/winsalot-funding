import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { crmWeekStartOf, computeCrmAgentPerformance, crmDateKey } from "@/lib/crm-performance";
import { syncCrmWeeklyPerformanceHistory } from "@/lib/crm-performance-history-sync";
import type { CrmWeeklyHistoryRow } from "@/lib/crm-performance-history";
import type { CrmUserRow } from "@/lib/crm-types";
import CrmPerformanceCard from "@/components/CrmPerformanceCard";
import CrmMonthlyPerformanceSection from "@/components/CrmMonthlyPerformanceSection";

// Admin view of the Winsalot Growth CRM's Agent Performance Report -
// every active agent, each with their own weekly-target card (see
// CrmPerformanceCard). Agents only ever see their own card -
// /agent/performance. Below the weekly cards, CrmMonthlyPerformanceSection
// adds the Monthly Performance history view, reading the permanent weekly
// ledger this page keeps in sync (see crm-performance-history-sync.ts).
export default async function AdminCrmPerformancePage() {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();

  const [{ data: agents }, records] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true).order("full_name"),
    getCrmPerformanceRecords(),
  ]);

  const allAgents = (agents ?? []) as Pick<CrmUserRow, "id" | "full_name" | "email">[];

  const now = new Date();
  await syncCrmWeeklyPerformanceHistory(admin, allAgents, records, now);

  const { data: historyRows } = await admin
    .from("crm_agent_weekly_performance")
    .select(
      "agent_id, agent_name, period_start, period_end, consultations_booked, consultations_booked_target, consultations_booked_percentage, leads_added, leads_added_target, leads_added_percentage, emails_delivered, emails_delivered_target, emails_delivered_percentage, overall_percentage, status"
    )
    .eq("definition_version", 3)
    .in("agent_id", allAgents.map((agent) => agent.id));

  const todayKey = crmDateKey(now);
  const currentPeriodStart = crmWeekStartOf(todayKey);
  const [currentYear, currentMonth] = todayKey.split("-").map(Number);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent Performance Report</h1>
          <p className="mt-1 text-sm text-slate-500">
            Weekly (Monday-Friday) performance against three verified actions per agent: opportunity leads added,
            emails delivered, and consultations booked.
          </p>
        </div>
        <Link
          href="/admin/crm/performance/call-notes"
          className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
        >
          View All Call Logs
        </Link>
      </div>

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
        historyRows={(historyRows ?? []) as CrmWeeklyHistoryRow[]}
        currentPeriodStart={currentPeriodStart}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
    </div>
  );
}
