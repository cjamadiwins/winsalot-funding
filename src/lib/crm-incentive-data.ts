import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmIncentiveQuote } from "./crm-incentives";

// Fetches every crm_leads row linked to a quote request, joined with
// that quote request's customer_quote_sent_at and incentive_status,
// shaped for computeCrmWeeklyIncentive. Mirrors getCrmPerformanceRecords
// (crm-performance-data.ts) exactly - same service-role rationale
// (quote_requests has RLS enabled with no policies at all, see migration
// 0004's comment), same agentId-scoping convention for the agent's own
// dashboard vs the admin's "every agent" view.
export async function getCrmIncentiveQuotes(agentId?: string): Promise<CrmIncentiveQuote[]> {
  const admin = getSupabaseAdmin();

  let leadsQuery = admin
    .from("crm_leads")
    .select("id, assigned_agent_id, quote_request_id")
    .not("quote_request_id", "is", null);
  if (agentId) leadsQuery = leadsQuery.eq("assigned_agent_id", agentId);

  const { data: leads } = await leadsQuery;
  if (!leads || leads.length === 0) return [];

  const quoteRequestIds = leads.map((l) => l.quote_request_id as string);

  const { data: quoteRequests } = await admin
    .from("quote_requests")
    .select("id, customer_quote_sent_at, incentive_status")
    .in("id", quoteRequestIds);

  const quoteById = new Map((quoteRequests ?? []).map((q) => [q.id as string, q]));

  return leads
    .map((lead) => {
      const quote = quoteById.get(lead.quote_request_id as string);
      return {
        id: lead.quote_request_id as string,
        assignedAgentId: (lead.assigned_agent_id as string | null) ?? null,
        customerQuoteSentAt: (quote?.customer_quote_sent_at as string | null) ?? null,
        incentiveStatus: (quote?.incentive_status as CrmIncentiveQuote["incentiveStatus"]) ?? null,
      };
    })
    .filter((quote) => quoteById.has(quote.id));
}
