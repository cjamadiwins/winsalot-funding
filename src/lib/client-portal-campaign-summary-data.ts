import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  buildClientCampaignSummary,
  type ClientCampaignSummary,
  type SummaryAgreementTarget,
  type SummaryCallList,
  type SummaryCampaign,
} from "./client-portal-campaign-summary";

// Read-only. Call lists, their agent roster and the agreements table are not
// readable by a client session under RLS (and are deliberately left that way),
// so - exactly like loadPortalReceipts - the portal reads them server-side with
// the service role, scoped to the authenticated portal user's own client, and
// returns display strings only (never ids, emails or other internal fields).
// Nothing here writes, and no policy is widened.
export async function loadClientCampaignSummary(client: { id: string; name: string }, campaigns: SummaryCampaign[]): Promise<ClientCampaignSummary> {
  let isInternalTest = false;
  let lists: SummaryCallList[] = [];
  let agreements: SummaryAgreementTarget[] = [];

  try {
    const db = getSupabaseAdmin();
    const campaignIds = campaigns.map((c) => c.id);

    const [{ data: clientRow }, { data: segments }, { data: crmClients }] = await Promise.all([
      db.from("leadgen_clients").select("is_internal_test").eq("id", client.id).maybeSingle(),
      campaignIds.length > 0
        ? db
            .from("call_list_segments")
            .select("id, leadgen_campaign_id, status, deployed_at, industry, territory")
            .eq("crm", "lead_generation")
            .in("leadgen_campaign_id", campaignIds)
        : Promise.resolve({ data: [] as never[] }),
      db.from("crm_clients").select("id").eq("leadgen_client_id", client.id),
    ]);
    isInternalTest = clientRow?.is_internal_test === true;

    const segs = (segments ?? []) as {
      id: string;
      leadgen_campaign_id: string;
      status: string;
      deployed_at: string | null;
      industry: string | null;
      territory: string | null;
    }[];

    // Agents + lead counts are only needed for active, deployed lists (the only
    // ones that can qualify); everything else is carried with no agents / 0 leads.
    const candidates = segs.filter((s) => s.status === "active" && s.deployed_at !== null);
    const candidateIds = candidates.map((s) => s.id);

    const [{ data: roster }, leadFlags] = await Promise.all([
      candidateIds.length > 0 ? db.from("call_list_segment_agents").select("segment_id, agent_id").in("segment_id", candidateIds) : Promise.resolve({ data: [] as never[] }),
      Promise.all(
        candidateIds.map(async (segmentId) => {
          const { data } = await db.from("call_list_leads").select("id").eq("segment_id", segmentId).limit(1);
          return [segmentId, (data?.length ?? 0) > 0] as const;
        }),
      ),
    ]);
    const hasLeads = new Map(leadFlags);

    const rosterRows = (roster ?? []) as { segment_id: string; agent_id: string }[];
    const agentIds = [...new Set(rosterRows.map((r) => r.agent_id))];
    const { data: agentUsers } =
      agentIds.length > 0 ? await db.from("leadgen_users").select("id, full_name").in("id", agentIds).eq("role", "agent").eq("active", true) : { data: [] as never[] };
    const nameById = new Map(((agentUsers ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]));

    lists = segs.map((s) => ({
      campaignId: s.leadgen_campaign_id,
      status: s.status,
      deployedAt: s.deployed_at,
      leadCount: hasLeads.get(s.id) ? 1 : 0,
      industry: s.industry,
      territory: s.territory,
      agentNames: rosterRows.filter((r) => r.segment_id === s.id).map((r) => nameById.get(r.agent_id)).filter((n): n is string => Boolean(n)),
    }));

    const crmClientIds = ((crmClients ?? []) as { id: string }[]).map((c) => c.id);
    if (crmClientIds.length > 0) {
      const { data: agreementRows } = await db
        .from("crm_client_agreements")
        .select("status, appointment_target_min, appointment_target_max, created_at")
        .in("client_id", crmClientIds)
        .eq("status", "signed");
      agreements = ((agreementRows ?? []) as { status: string; appointment_target_min: number | null; appointment_target_max: number | null; created_at: string }[]).map((a) => ({
        status: a.status,
        min: a.appointment_target_min,
        max: a.appointment_target_max,
        createdAt: a.created_at,
      }));
    }
  } catch (error) {
    // The summary is display-only; a failed lookup hides team/targeting rather
    // than breaking the whole dashboard.
    console.error("loadClientCampaignSummary failed", error);
  }

  return buildClientCampaignSummary({ clientName: client.name, isInternalTest, campaigns, lists, agreements });
}
