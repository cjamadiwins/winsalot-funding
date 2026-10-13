import { isHiddenLeadgenCampaignName } from "./leadgen-types";

// Every NEW Lead Generation lead must belong to an active, authorized
// campaign. The lead's client is always taken from that campaign, never from
// a separately submitted value, so a lead can't end up on a campaign that
// belongs to a different client. Existing leads are never re-validated.
//
// Why it matters: agent RLS on leadgen_leads only shows a lead whose campaign
// (or, for older rows with no campaign, whose client) is assigned to the agent,
// so a campaign-less new lead is easy to create and hard to find again.

export const NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE = "Select a campaign for this lead.";

type CampaignInput = { id: string; name: string; status: string; client_id: string } | null | undefined;
type ClientInput = { id: string; active: boolean } | null | undefined;

export type NewLeadCampaignResult = { ok: true; campaignId: string; clientId: string } | { ok: false; error: string };

// Pure rules, kept separate from the data fetching below so they can be tested
// without a database. `agentCampaignIds` is only passed for an agent (Admin
// may use any active campaign); `submittedClientId` is whatever the form sent.
export function checkNewLeadCampaign(input: {
  campaignId: string;
  submittedClientId?: string | null;
  campaign: CampaignInput;
  client: ClientInput;
  agentCampaignIds?: readonly string[];
}): NewLeadCampaignResult {
  const { campaignId, submittedClientId, campaign, client, agentCampaignIds } = input;
  if (!campaignId) return { ok: false, error: NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE };
  if (!campaign || campaign.id !== campaignId || isHiddenLeadgenCampaignName(campaign.name)) {
    return { ok: false, error: "This campaign is not available." };
  }
  if (campaign.status !== "active") return { ok: false, error: "This campaign is not active." };
  if (!client || client.id !== campaign.client_id || !client.active) return { ok: false, error: "This campaign's client is inactive." };
  if (submittedClientId && submittedClientId !== campaign.client_id) {
    return { ok: false, error: "That campaign doesn't belong to the selected client." };
  }
  if (agentCampaignIds && !agentCampaignIds.includes(campaign.id)) {
    return { ok: false, error: "That campaign isn't assigned to you." };
  }
  return { ok: true, campaignId: campaign.id, clientId: campaign.client_id };
}

// The slice of the service-role Supabase client this needs, so it stays
// testable and doesn't import the server-only admin module.
type Query = { eq: (column: string, value: string) => Query; maybeSingle: () => PromiseLike<{ data: unknown }> };
type ReadClient = { from: (table: string) => { select: (columns: string) => Query } };

// `adminClient` is the service-role client; it is narrowed to ReadClient here
// because the full generated client type is too deep for TypeScript to compare.
export async function resolveNewLeadCampaign(
  adminClient: object,
  input: { campaignId: string; submittedClientId?: string | null; agentId?: string }
): Promise<NewLeadCampaignResult> {
  const admin = adminClient as unknown as ReadClient;
  const campaignId = input.campaignId.trim();
  if (!campaignId) return { ok: false, error: NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE };

  const { data: campaign } = (await admin.from("leadgen_campaigns").select("id, name, status, client_id").eq("id", campaignId).maybeSingle()) as {
    data: CampaignInput;
  };
  const { data: client } = campaign
    ? ((await admin.from("leadgen_clients").select("id, active").eq("id", campaign.client_id).maybeSingle()) as { data: ClientInput })
    : { data: null };

  let agentCampaignIds: string[] | undefined;
  if (input.agentId) {
    const { data: assignment } = (await admin
      .from("leadgen_campaign_agents")
      .select("campaign_id")
      .eq("campaign_id", campaignId)
      .eq("agent_id", input.agentId)
      .maybeSingle()) as { data: { campaign_id: string } | null };
    agentCampaignIds = assignment ? [assignment.campaign_id] : [];
  }

  return checkNewLeadCampaign({ campaignId, submittedClientId: input.submittedClientId, campaign, client, agentCampaignIds });
}
