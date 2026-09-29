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
