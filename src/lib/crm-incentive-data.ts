import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmIncentiveOpportunity } from "./crm-incentives";

// Fetches every crm_opportunities row shaped for computeCrmWeeklyIncentive.
// Mirrors getCrmPerformanceRecords (crm-performance-data.ts) exactly -
// same agentId-scoping convention for the agent's own dashboard vs the
// admin's "every agent" view.
export async function getCrmIncentiveOpportunities(agentId?: string): Promise<CrmIncentiveOpportunity[]> {
  const admin = getSupabaseAdmin();

  let query = admin.from("crm_opportunities").select("id, assigned_agent_id, stage, closed_at");
  if (agentId) query = query.eq("assigned_agent_id", agentId);

  const { data: opportunities } = await query;
  if (!opportunities) return [];

  return opportunities.map((o) => ({
    id: o.id as string,
    assignedAgentId: (o.assigned_agent_id as string | null) ?? null,
    stage: o.stage as string,
    closedAt: (o.closed_at as string | null) ?? null,
  }));
}
