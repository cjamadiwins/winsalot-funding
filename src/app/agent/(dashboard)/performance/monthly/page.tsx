import Link from "next/link";
import { requireCrmUser } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { biweeklyPeriodStartOf, crmDateKey } from "@/lib/crm-performance";
import { syncCrmBiweeklyPerformanceHistory } from "@/lib/crm-performance-history-sync";
import type { CrmBiweeklyHistoryRow } from "@/lib/crm-performance-history";
import CrmAgentMonthlyPerformanceCard from "@/components/CrmAgentMonthlyPerformanceCard";

// Agent's own view of the Cleaning CRM's Monthly Performance report -
// only ever this agent's own data, never another agent's:
//  - getCrmPerformanceRecords(crmUser.id) scopes the underlying
//    crm_leads query itself to this agent's own leads, exactly the way
//    the existing biweekly page (/agent/performance) already does.
//  - the one-time freeze-completed-periods sync needs the service-role
//    admin client (agents have no insert/update grant on
//    crm_agent_biweekly_performance, only select-own - migration 0052),
//    but is called with only this agent in its `agents` list, so it
//    only ever writes this agent's own history rows.
//  - the history read-back is explicitly filtered to this agent's id,
//    even though it's on the admin client, as defense in depth on top
//    of that scoping.
// The admin's equivalent view (/admin/crm/performance) shows every
// agent and lets the admin switch between them; this page deliberately
// has no such switch.
export default async function AgentCrmMonthlyPerformancePage() {
  const crmUser = await requireCrmUser();
  const admin = getSupabaseAdmin();

  const records = await getCrmPerformanceRecords(crmUser.id);

  const now = new Date();
  await syncCrmBiweeklyPerformanceHistory(admin, [{ id: crmUser.id, full_name: crmUser.full_name, email: crmUser.email }], records, now);

  const { data: historyRows } = await admin
    .from("crm_agent_biweekly_performance")
    .select(
      "agent_id, agent_name, period_start, period_end, quotes_sent, quotes_sent_target, quotes_sent_percentage, quotes_received, quotes_received_target, quotes_received_percentage, overall_percentage, status"
    )
    .eq("agent_id", crmUser.id);

  const todayKey = crmDateKey(now);
  const currentPeriodStart = biweeklyPeriodStartOf(todayKey);
  const [currentYear, currentMonth] = todayKey.split("-").map(Number);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">Monthly Performance</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Your quotes sent and completed quote requests submitted for the selected month, against goals based on the biweekly targets
            that fall within it. Previous months stay available after the month changes.
          </p>
        </div>
        <Link href="/agent/performance" className="text-[13px] font-medium text-[var(--color-accent)] hover:underline">
          ← View Biweekly Performance
        </Link>
      </div>

      <div className="mt-6">
        <CrmAgentMonthlyPerformanceCard
          agentId={crmUser.id}
          agentName={crmUser.full_name || crmUser.email}
          records={records}
          historyRows={(historyRows ?? []) as CrmBiweeklyHistoryRow[]}
          currentPeriodStart={currentPeriodStart}
          currentYear={currentYear}
          currentMonth={currentMonth}
        />
      </div>
    </div>
  );
}
