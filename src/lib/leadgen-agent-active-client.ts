import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";

// Agent Client Status: the Admin-chosen "active client" for each agent.
// Stored in the existing leadgen_users.current_campaign_id (a campaign id -
// the client is always derived from it, never stored separately), so no
// schema change is needed. Admin picks a *client*; the campaign saved is that
// client's representative campaign (its active campaign, else its most
// recently created one).

export type ActiveClientOption = { id: string; name: string; campaignId: string };

export type AgentActiveClient = { clientId: string; clientName: string; campaignId: string; campaignName: string };

// Active Lead Gen clients an Admin may pick - real client records only, no
// hard-coded names. The internal test client is never offered.
export async function listSelectableActiveClients(): Promise<ActiveClientOption[]> {
  const admin = getSupabaseAdmin();
  const [{ data: clients }, { data: campaigns }] = await Promise.all([
    admin.from("leadgen_clients").select("id, name").eq("active", true).eq("is_internal_test", false).order("name"),
    admin.from("leadgen_campaigns").select("id, client_id, status, created_at").order("created_at", { ascending: false }),
  ]);
  const options: ActiveClientOption[] = [];
  for (const client of clients ?? []) {
    const own = (campaigns ?? []).filter((c) => c.client_id === client.id);
    const representative = own.find((c) => c.status === "active") ?? own[0];
    if (representative) options.push({ id: client.id as string, name: client.name as string, campaignId: representative.id as string });
  }
  return options;
}

// The agent's Admin-selected client, if it's still a valid active one.
export async function getAgentActiveClient(agentId: string): Promise<AgentActiveClient | null> {
  const admin = getSupabaseAdmin();
  const { data: user } = await admin.from("leadgen_users").select("current_campaign_id").eq("id", agentId).maybeSingle();
  if (!user?.current_campaign_id) return null;
  const { data: campaign } = await admin.from("leadgen_campaigns").select("id, name, client_id").eq("id", user.current_campaign_id).maybeSingle();
  if (!campaign) return null;
  const { data: client } = await admin.from("leadgen_clients").select("id, name, active").eq("id", campaign.client_id).maybeSingle();
  if (!client || !client.active) return null;
  return { clientId: client.id as string, clientName: client.name as string, campaignId: campaign.id as string, campaignName: campaign.name as string };
}

export type AttributionSource = "call_list" | "agent_default" | "none";

// The attribution hierarchy, in one place:
//   Explicit call-list client  ->  Admin-selected agent client  ->  none.
// The agent default is only ever a fallback; it can never override a client
// a call list explicitly belongs to.
export function pickAttributionClient<T>(callListClient: T | null | undefined, agentActiveClient: T | null | undefined): { source: AttributionSource; client: T | null } {
  if (callListClient) return { source: "call_list", client: callListClient };
  if (agentActiveClient) return { source: "agent_default", client: agentActiveClient };
  return { source: "none", client: null };
}

// ---------------------------------------------------------------------------
// Multi-client assignment (Admin dashboard -> Agent Client Status).
//
// An agent's assigned clients are derived from the EXISTING
// leadgen_campaign_agents rows (an agent is assigned to a client when they
// have a row on any of that client's campaigns) - no second relationship is
// stored. The Primary/Current client is the existing
// leadgen_users.current_campaign_id. Nothing here touches call logs, leads,
// appointments, emails or reports, which keep the client_id they were recorded
// under.
// ---------------------------------------------------------------------------

export type CampaignAgentRow = { campaign_id: string; agent_id: string };
export type CampaignRow = { id: string; client_id: string };

export type AgentClientAssignment = {
  // Assigned clients that Admin can see/manage (active, non-test), each with
  // how many campaign rows back that assignment.
  clients: { clientId: string; rows: number }[];
  // Every leadgen_campaign_agents row the agent has (including rows for
  // inactive/test clients that aren't shown). Zero means "unrestricted".
  totalRows: number;
  primaryClientId: string | null;
};

export function groupAgentClientAssignments(
  campaignAgents: CampaignAgentRow[],
  campaigns: CampaignRow[],
  manageableClientIds: Set<string>,
  agents: { id: string; current_campaign_id: string | null }[]
): Map<string, AgentClientAssignment> {
  const clientByCampaign = new Map(campaigns.map((c) => [c.id, c.client_id]));
  const result = new Map<string, AgentClientAssignment>();
  for (const agent of agents) {
    const rows = campaignAgents.filter((r) => r.agent_id === agent.id);
    const perClient = new Map<string, number>();
    for (const row of rows) {
      const clientId = clientByCampaign.get(row.campaign_id);
      if (clientId && manageableClientIds.has(clientId)) perClient.set(clientId, (perClient.get(clientId) ?? 0) + 1);
    }
    const primaryClientId = agent.current_campaign_id ? (clientByCampaign.get(agent.current_campaign_id) ?? null) : null;
    result.set(agent.id, {
      clients: [...perClient.entries()].map(([clientId, count]) => ({ clientId, rows: count })),
      totalRows: rows.length,
      primaryClientId: primaryClientId && manageableClientIds.has(primaryClientId) ? primaryClientId : null,
    });
  }
  return result;
}

// The two restriction rules live in a client-safe module so the Admin UI and
// the server actions can never disagree about them.
export { assignmentWouldRestrictAgentClient as assignmentWouldRestrictAgent, removalWouldUnrestrictAgentClient as removalWouldUnrestrictAgent } from "./leadgen-agent-client-rules";
