import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmPerformanceQuoteRecord } from "./crm-performance";

// Fetches every crm_leads row linked to a quote request, joined with that
// quote request's customer_quote_sent_at and the earliest matching
// provider_quote_submissions row, shaped for computeCrmAgentPerformance.
//
// Always uses the service-role client: quote_requests and
// provider_quote_submissions (migration 0004) have RLS enabled with no
// policies at all, so neither an agent's nor an admin's session-scoped
// client can read them directly - same rationale as
// recalculateProviderScore() (lib/provider-score.ts) and
// getProviderQuoteHistory() (lib/provider-quote-history.ts).
//
// Pass agentId to scope the crm_leads query itself (used by the agent's
// own /agent/performance page) so an agent's session never even receives
// another agent's rows over the wire; omit it for the admin's "every
// agent" view (/admin/crm/performance).
export async function getCrmPerformanceRecords(agentId?: string): Promise<CrmPerformanceQuoteRecord[]> {
  const admin = getSupabaseAdmin();

  let leadsQuery = admin
    .from("crm_leads")
    .select("id, business_name, assigned_agent_id, quote_request_id")
    .not("quote_request_id", "is", null);
  if (agentId) leadsQuery = leadsQuery.eq("assigned_agent_id", agentId);

  const { data: leads } = await leadsQuery;
  if (!leads || leads.length === 0) return [];

  const quoteRequestIds = leads.map((l) => l.quote_request_id as string);

  const [{ data: quoteRequests }, { data: submissions }] = await Promise.all([
    admin.from("quote_requests").select("id, customer_quote_sent_at").in("id", quoteRequestIds),
    admin
      .from("provider_quote_submissions")
      .select("quote_request_id, created_at")
      .in("quote_request_id", quoteRequestIds)
      .order("created_at", { ascending: true }),
  ]);

  const sentAtByRequestId = new Map<string, string | null>(
    (quoteRequests ?? []).map((r) => [r.id as string, (r.customer_quote_sent_at as string | null) ?? null])
  );

  // First (earliest) submission per quote request - the moment a provider
  // first submitted a completed quote, which is what "Provider quote
  // received" means. Rows are ordered ascending above, so the first time
  // an id is seen here is its earliest submission.
  const receivedAtByRequestId = new Map<string, string>();
  for (const submission of submissions ?? []) {
    const id = submission.quote_request_id as string;
    if (!receivedAtByRequestId.has(id)) receivedAtByRequestId.set(id, submission.created_at as string);
  }

  return leads.map((lead) => ({
    leadId: lead.id as string,
    assignedAgentId: (lead.assigned_agent_id as string | null) ?? null,
    businessName: lead.business_name as string,
    quoteSentAt: sentAtByRequestId.get(lead.quote_request_id as string) ?? null,
    quoteReceivedAt: receivedAtByRequestId.get(lead.quote_request_id as string) ?? null,
  }));
}
