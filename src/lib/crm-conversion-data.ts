import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmOpportunityConversionRecord } from "./crm-conversion";

// Fetches every crm_opportunities row shaped for the Prospect-to-Client
// Rate KPI. Unlike the old quote-linked version, this reads
// crm_opportunities directly - stage already tells us whether an
// opportunity is currently a won client, no join to a separate
// fulfillment table needed.
//
// Pass agentId to scope the query itself (used by the agent's own
// /agent/dashboard) so an agent's session never even receives another
// agent's rows over the wire; omit it for the admin's "every agent" view
// (/admin/crm/opportunities).
export async function getCrmOpportunityConversionRecords(agentId?: string): Promise<CrmOpportunityConversionRecord[]> {
  const admin = getSupabaseAdmin();

  let query = admin.from("crm_opportunities").select("id, business_name, assigned_agent_id, created_at, stage");
  if (agentId) query = query.eq("assigned_agent_id", agentId);

  const { data: opportunities } = await query;
  if (!opportunities || opportunities.length === 0) return [];

  return opportunities.map((o) => ({
    opportunityId: o.id as string,
    businessName: o.business_name as string,
    assignedAgentId: (o.assigned_agent_id as string | null) ?? null,
    createdAt: o.created_at as string,
    stage: o.stage as string,
  }));
}
