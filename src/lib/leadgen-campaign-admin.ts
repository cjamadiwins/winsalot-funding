import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getWebsiteLaunchReadiness, torontoDateKey, WEBSITE_LAUNCH_CLIENTS, WEBSITE_LAUNCH_DATE } from "./leadgen-launch-readiness";
import { TEST_CLIENT_LIST_MESSAGE } from "./leadgen-test-client-guard";
import { validateCampaignForm, type CampaignDetail, type CampaignFormInput, type CampaignStatus } from "./leadgen-campaign-form";

// Admin-only create/edit of a Lead Generation campaign from the Call List
// Assignment panel (the server action gates on requireLeadgenAdmin first).
// Everything is written to the existing campaign model: leadgen_campaigns, the
// campaign's agent access in leadgen_campaign_agents, and Admin-only notes in
// leadgen_campaign_admin_notes. Leads, call logs, appointments, callbacks,
// notes, DNC, call-list rosters and segment assignments are never touched.

type Admin = ReturnType<typeof getSupabaseAdmin>;

const CAMPAIGN_COLUMNS = "id, client_id, name, description, status, start_date, territory, target_industry, call_script_text";

type CampaignRow = {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  start_date: string | null;
  territory: string | null;
  target_industry: string | null;
  call_script_text: string | null;
};

async function loadAgentIds(admin: Admin, campaignId: string): Promise<string[]> {
  const { data } = await admin.from("leadgen_campaign_agents").select("agent_id").eq("campaign_id", campaignId);
  return (data ?? []).map((row) => row.agent_id as string);
}

export async function loadCampaignDetails(admin: Admin, campaignIds: string[]): Promise<CampaignDetail[]> {
  if (campaignIds.length === 0) return [];
  const [{ data: campaigns }, { data: notes }, { data: agents }] = await Promise.all([
    admin.from("leadgen_campaigns").select(CAMPAIGN_COLUMNS).in("id", campaignIds),
    admin.from("leadgen_campaign_admin_notes").select("campaign_id, notes").in("campaign_id", campaignIds),
    admin.from("leadgen_campaign_agents").select("campaign_id, agent_id").in("campaign_id", campaignIds),
  ]);
  const noteById = new Map((notes ?? []).map((n) => [n.campaign_id as string, n.notes as string]));
  const agentsById = new Map<string, string[]>();
  for (const row of agents ?? []) (agentsById.get(row.campaign_id as string) ?? agentsById.set(row.campaign_id as string, []).get(row.campaign_id as string)!).push(row.agent_id as string);
  return ((campaigns ?? []) as CampaignRow[]).map((c) => toDetail(c, noteById.get(c.id) ?? "", agentsById.get(c.id) ?? []));
}

function toDetail(c: CampaignRow, adminNotes: string, agentIds: string[]): CampaignDetail {
  return {
    id: c.id,
    clientId: c.client_id,
    name: c.name,
    industry: c.target_industry ?? "",
    territory: c.territory ?? "",
    description: c.description ?? "",
    script: c.call_script_text ?? "",
    status: c.status,
    startDate: c.start_date ?? "",
    adminNotes,
    agentIds,
  };
}

async function assertActiveAgents(admin: Admin, agentIds: string[]): Promise<void> {
  if (agentIds.length === 0) return;
  const { data } = await admin.from("leadgen_users").select("id").in("id", agentIds).eq("role", "agent").eq("active", true);
  const ok = new Set((data ?? []).map((a) => a.id as string));
  if (agentIds.some((id) => !ok.has(id))) throw new Error("One of the selected agents isn't an active agent.");
}

async function assertNameAvailable(admin: Admin, clientId: string, name: string, exceptCampaignId?: string): Promise<void> {
  const { data } = await admin.from("leadgen_campaigns").select("id, name").eq("client_id", clientId);
  const clash = (data ?? []).some((c) => c.id !== exceptCampaignId && (c.name as string).trim().toLowerCase() === name.toLowerCase());
  if (clash) throw new Error("This client already has a campaign with that name.");
}

// Same activation safeguards the existing campaign editor applies: an inactive
// client can't run an active campaign, and the website-launch clients stay behind
// their launch-readiness gate (no override here - use the campaign page for that).
async function assertMayBeActive(admin: Admin, clientId: string, startDate: string | null): Promise<void> {
  const { data: client } = await admin.from("leadgen_clients").select("name, active").eq("id", clientId).maybeSingle();
  if (!client?.active) throw new Error("Cannot activate a campaign for an inactive client.");
  if (WEBSITE_LAUNCH_CLIENTS.includes(client.name as (typeof WEBSITE_LAUNCH_CLIENTS)[number])) {
    const earliest = startDate && startDate > WEBSITE_LAUNCH_DATE ? startDate : WEBSITE_LAUNCH_DATE;
    if (torontoDateKey() < earliest) throw new Error(`Outbound production cannot begin before ${earliest}. Save it as Paused for now.`);
    const readiness = await getWebsiteLaunchReadiness(clientId);
    if (readiness.blockers.length > 0) {
      throw new Error(`Save as Paused until launch requirements are met (${readiness.blockers.join("; ")}). Activate it from the client's campaign page, which has the explicit Admin override.`);
    }
  }
}

async function saveNotes(admin: Admin, campaignId: string, notes: string, adminId: string): Promise<void> {
  const { error } = await admin
    .from("leadgen_campaign_admin_notes")
    .upsert({ campaign_id: campaignId, notes, updated_at: new Date().toISOString(), updated_by: adminId }, { onConflict: "campaign_id" });
  if (error) throw new Error(`The campaign was saved, but its Admin notes could not be: ${error.message}`);
}

// Grants (never revokes) campaign access: removing an agent's client access is a
// separate Admin flow (Agent Client Status) that also handles Primary client and
// list rosters, so it is deliberately not reachable from here.
async function grantAgents(admin: Admin, campaignId: string, agentIds: string[], adminId: string): Promise<void> {
  if (agentIds.length === 0) return;
  const { error } = await admin.from("leadgen_campaign_agents").upsert(
    agentIds.map((agent_id) => ({ campaign_id: campaignId, agent_id, assigned_by: adminId })),
    { onConflict: "campaign_id,agent_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`The campaign was saved, but agent access could not be granted: ${error.message}`);
}

export async function createLeadgenCampaign(clientId: string, input: CampaignFormInput, adminId: string): Promise<CampaignDetail> {
  const parsed = validateCampaignForm(input);
  if (parsed.error !== undefined) throw new Error(parsed.error);
  const admin = getSupabaseAdmin();

  const { data: client } = await admin.from("leadgen_clients").select("id, active, is_internal_test").eq("id", clientId).maybeSingle();
  if (!client) throw new Error("That client no longer exists.");
  if (client.is_internal_test) throw new Error(TEST_CLIENT_LIST_MESSAGE);
  if (!client.active) throw new Error("That client isn't active.");
  await assertNameAvailable(admin, clientId, parsed.fields.name);
  if (parsed.fields.status === "active") await assertMayBeActive(admin, clientId, parsed.fields.start_date);
  await assertActiveAgents(admin, parsed.agentIds);

  const { data: created, error } = await admin
    .from("leadgen_campaigns")
    .insert({ ...parsed.fields, client_id: clientId, created_by: adminId })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error || !created) throw new Error(`Failed to create the campaign: ${error?.message ?? "unknown error"}`);

  await grantAgents(admin, created.id as string, parsed.agentIds, adminId);
  if (parsed.adminNotes) await saveNotes(admin, created.id as string, parsed.adminNotes, adminId);
  return toDetail(created as CampaignRow, parsed.adminNotes, await loadAgentIds(admin, created.id as string));
}

export async function updateLeadgenCampaign(campaignId: string, input: CampaignFormInput, adminId: string): Promise<CampaignDetail> {
  const parsed = validateCampaignForm(input);
  if (parsed.error !== undefined) throw new Error(parsed.error);
  const admin = getSupabaseAdmin();

  const { data: current } = await admin.from("leadgen_campaigns").select("id, client_id, status").eq("id", campaignId).maybeSingle();
  if (!current) throw new Error("That campaign no longer exists.");
  await assertNameAvailable(admin, current.client_id as string, parsed.fields.name, campaignId);
  if (parsed.fields.status === "active" && current.status !== "active") await assertMayBeActive(admin, current.client_id as string, parsed.fields.start_date);
  await assertActiveAgents(admin, parsed.agentIds);

  // client_id, created_by and everything that references this campaign stay as-is.
  const { data: updated, error } = await admin
    .from("leadgen_campaigns")
    .update({ ...parsed.fields, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error || !updated) throw new Error(`Failed to update the campaign: ${error?.message ?? "unknown error"}`);

  await grantAgents(admin, campaignId, parsed.agentIds, adminId);
  await saveNotes(admin, campaignId, parsed.adminNotes, adminId);
  return toDetail(updated as CampaignRow, parsed.adminNotes, await loadAgentIds(admin, campaignId));
}
