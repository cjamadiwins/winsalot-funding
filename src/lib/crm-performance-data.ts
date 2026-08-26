import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmPerformanceOpportunityRecord } from "./crm-performance";

// Fetches every crm_opportunities row shaped for computeCrmAgentPerformance.
// Unlike the old quote-linked version, this reads crm_opportunities
// directly - no join to a separate fulfillment table, since
// consultation_date/proposal_sent_at/application_submitted_at/closed_at
// all live on the opportunity itself now.
//
// Uses the service-role client so a single call can cover every agent for
// the admin's "every agent" view (/admin/crm/performance) without an
// extra round trip per agent; pass agentId to scope the query itself
// (used by the agent's own /agent/performance page) so an agent's session
// never even receives another agent's rows over the wire.
export async function getCrmPerformanceRecords(agentId?: string): Promise<CrmPerformanceOpportunityRecord[]> {
  const admin = getSupabaseAdmin();

  let query = admin
    .from("crm_opportunities")
    .select(
      "id, business_name, assigned_agent_id, opportunity_type, stage, created_at, consultation_date, proposal_sent_at, application_submitted_at, closed_at"
    );
  if (agentId) query = query.eq("assigned_agent_id", agentId);

  const { data: opportunities } = await query;
  if (!opportunities || opportunities.length === 0) return [];

  return opportunities.map((o) => ({
    opportunityId: o.id as string,
    assignedAgentId: (o.assigned_agent_id as string | null) ?? null,
    businessName: o.business_name as string,
    opportunityType: o.opportunity_type as CrmPerformanceOpportunityRecord["opportunityType"],
    stage: o.stage as string,
    createdAt: o.created_at as string,
    consultationDate: (o.consultation_date as string | null) ?? null,
    proposalSentAt: (o.proposal_sent_at as string | null) ?? null,
    applicationSubmittedAt: (o.application_submitted_at as string | null) ?? null,
    closedAt: (o.closed_at as string | null) ?? null,
  }));
}
