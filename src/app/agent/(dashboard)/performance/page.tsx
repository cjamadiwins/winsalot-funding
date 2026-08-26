import { requireCrmUser } from "@/lib/crm-auth";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { computeCrmAgentPerformance } from "@/lib/crm-performance";
import CrmPerformanceCard from "@/components/CrmPerformanceCard";

// Agent's own view of the Winsalot Growth CRM's Agent Performance Report - just
// their own card. getCrmPerformanceRecords(agent.id) scopes the underlying
// query to this agent's own leads, so this can never return another
// agent's data; the admin's equivalent page (/admin/crm/performance) shows
// every agent.
export default async function AgentPerformancePage() {
  const crmUser = await requireCrmUser();
  const records = await getCrmPerformanceRecords(crmUser.id);
  const performance = computeCrmAgentPerformance(records, crmUser.id);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">My Performance</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Your biweekly performance against five targets, reset every two weeks: consultations booked, qualified opportunities,
        applications submitted, proposals sent, and clients won.
      </p>

      <div className="mt-6">
        <CrmPerformanceCard agentName={crmUser.full_name || crmUser.email} performance={performance} />
      </div>
    </div>
  );
}
