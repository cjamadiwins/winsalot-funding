import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmLeadToQuoteRecord } from "./crm-conversion";

// Fetches every crm_leads row (unlike getCrmPerformanceRecords in
// crm-performance-data.ts, this includes leads that were never linked to
// a quote request too - the Lead-to-Quote Rate's "Total Leads"
// denominator is every lead, not just ones that reached a quote), joined
// with that lead's linked quote request's customer_quote_sent_at.
//
// Always uses the service-role client: quote_requests has RLS enabled
// with no policies at all, so neither an agent's nor an admin's
// session-scoped client can read it directly - same rationale as
// getCrmPerformanceRecords().
//
// Pass agentId to scope the crm_leads query itself (used by the agent's
// own /agent/dashboard) so an agent's session never even receives another
// agent's rows over the wire; omit it for the admin's "every agent" view
// (/admin/crm/leads).
export async function getCrmLeadToQuoteRecords(agentId?: string): Promise<CrmLeadToQuoteRecord[]> {
  const admin = getSupabaseAdmin();

  let leadsQuery = admin.from("crm_leads").select("id, business_name, assigned_agent_id, created_at, quote_request_id");
  if (agentId) leadsQuery = leadsQuery.eq("assigned_agent_id", agentId);

  const { data: leads } = await leadsQuery;
  if (!leads || leads.length === 0) return [];

  const quoteRequestIds = leads.map((l) => l.quote_request_id as string | null).filter((id): id is string => Boolean(id));

  const sentAtByRequestId = new Map<string, string | null>();
  if (quoteRequestIds.length > 0) {
    const { data: quoteRequests } = await admin
      .from("quote_requests")
      .select("id, customer_quote_sent_at")
      .in("id", quoteRequestIds);
    for (const request of quoteRequests ?? []) {
      sentAtByRequestId.set(request.id as string, (request.customer_quote_sent_at as string | null) ?? null);
    }
  }

  return leads.map((lead) => ({
    leadId: lead.id as string,
    businessName: lead.business_name as string,
    assignedAgentId: (lead.assigned_agent_id as string | null) ?? null,
    createdAt: lead.created_at as string,
    quoteSentAt: lead.quote_request_id ? (sentAtByRequestId.get(lead.quote_request_id as string) ?? null) : null,
  }));
}
