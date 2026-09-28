import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { createSupabaseServerClient } from "./supabase-server";
import { WEBSITE_CLIENT_NAMES, type TrainingClient, type TrainingCampaign } from "@/components/leadgen/WebsiteCampaignTraining";

const clientFields = "id, name, active, call_script_value_proposition, call_script_services, call_script_closing, call_script_notes, call_script_override";
const campaignFields = "id, client_id, status, territory, description, service_type, qualification_criteria";

export async function loadWebsiteTraining(admin: boolean, agentId?: string) {
  const db = admin ? getSupabaseAdmin() : await createSupabaseServerClient();
  const { data: clients, error: clientsError } = await db.from("leadgen_clients").select(clientFields).eq("active", true).in("name", [...WEBSITE_CLIENT_NAMES]);
  if (clientsError) throw clientsError;
  const activeClients = (clients ?? []) as TrainingClient[];
  if (!activeClients.length) return [];

  const [{ data: campaigns, error: campaignsError }, restrictionsResult] = await Promise.all([
    db.from("leadgen_campaigns").select(campaignFields).in("client_id", activeClients.map((client) => client.id)).in("status", admin ? ["active", "paused"] : ["active"]),
    !admin && agentId
      ? db.from("leadgen_campaign_agents").select("campaign_id").eq("agent_id", agentId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (campaignsError) throw campaignsError;
  if (restrictionsResult.error) throw restrictionsResult.error;
  // Matches the existing leadgen_agent_campaign_allowed rule: no rows
  // means unrestricted; otherwise only explicitly assigned campaigns.
  const restrictedIds = restrictionsResult.data?.length ? new Set(restrictionsResult.data.map((row) => row.campaign_id)) : null;
  const permitted = ((campaigns ?? []) as TrainingCampaign[]).filter((campaign) => !restrictedIds || restrictedIds.has(campaign.id));
  return WEBSITE_CLIENT_NAMES.flatMap((name) => {
    const client = activeClients.find((candidate) => candidate.name === name);
    const campaign = permitted.find((candidate) => candidate.client_id === client?.id);
    return client && campaign ? [{ client, campaign }] : [];
  });
}

export async function loadInactiveLegacyTraining() {
  const { data, error } = await getSupabaseAdmin().from("leadgen_clients").select("id, name").eq("active", false).in("name", ["Brent's Essentials", "Mantra Collab"]);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.name, row.id]));
}
