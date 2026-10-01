import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { createSupabaseServerClient } from "./supabase-server";
import { isWebsiteServicesCampaign } from "./leadgen-website-script";
import { deriveScriptDisplayState, type ScriptDisplayState, type ScriptStatusRow } from "./leadgen-script-status";
import { resolveScriptOverride } from "./leadgen-campaign-form";
import type { ScriptSessionPayload } from "./leadgen-script-session-types";

type SegmentLike = { id: string; name: string; industry: string | null; call_script_text: string | null; leadgen_campaign_id: string | null };

const CLIENT_FIELDS = "id, name, active, is_internal_test, call_script_value_proposition, call_script_services, call_script_closing, call_script_notes, call_script_override";

// Active Lead Gen call lists -> approved script payloads. Only lists whose
// campaign and client are active are returned. `agentId` (optional) further
// limits to campaigns that agent is explicitly assigned to, mirroring
// isAgentAssignedToActiveSegment().
async function buildPayloads(segments: SegmentLike[], agentId?: string): Promise<ScriptSessionPayload[]> {
  const admin = getSupabaseAdmin();
  const campaignIds = [...new Set(segments.map((s) => s.leadgen_campaign_id).filter((id): id is string => !!id))];
  if (campaignIds.length === 0) return [];
  const [{ data: campaigns }, assigned] = await Promise.all([
    admin.from("leadgen_campaigns").select("id, name, status, client_id, service_type, description, call_script_text").in("id", campaignIds),
    agentId ? admin.from("leadgen_campaign_agents").select("campaign_id").eq("agent_id", agentId) : Promise.resolve({ data: null }),
  ]);
  const assignedIds = agentId ? new Set((assigned.data ?? []).map((r) => r.campaign_id as string)) : null;
  const clientIds = [...new Set((campaigns ?? []).map((c) => c.client_id as string))];
  const { data: clients } = clientIds.length ? await admin.from("leadgen_clients").select(CLIENT_FIELDS).in("id", clientIds).eq("active", true) : { data: [] };
  const clientById = new Map((clients ?? []).map((c) => [c.id as string, c]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id as string, c]));

  const payloads: ScriptSessionPayload[] = [];
  for (const segment of segments) {
    const campaign = segment.leadgen_campaign_id ? campaignById.get(segment.leadgen_campaign_id) : undefined;
    if (!campaign || campaign.status !== "active") continue;
    if (assignedIds && !assignedIds.has(campaign.id as string)) continue;
    const client = clientById.get(campaign.client_id as string);
    if (!client || client.is_internal_test === true) continue;
    const listText = segment.call_script_text?.trim() || null;
    payloads.push({
      segmentId: segment.id,
      segmentName: segment.name,
      clientId: client.id as string,
      clientName: client.name as string,
      campaignId: campaign.id as string,
      campaignName: campaign.name as string,
      industry: segment.industry,
      websiteServices: isWebsiteServicesCampaign({
        clientName: client.name as string,
        services: client.call_script_services as string | null,
        campaignServiceType: campaign.service_type as string | null,
        campaignDescription: campaign.description as string | null,
      }),
      client: {
        name: client.name as string,
        call_script_value_proposition: client.call_script_value_proposition as string | null,
        call_script_services: client.call_script_services as string | null,
        call_script_closing: client.call_script_closing as string | null,
        call_script_notes: client.call_script_notes as string | null,
        call_script_override: resolveScriptOverride({ listText, campaignText: campaign.call_script_text as string | null, clientOverride: client.call_script_override as string | null }),
      },
    });
  }
  return payloads;
}

// The signed-in agent's own assigned, active lists. Lists come from the
// session-scoped client so RLS (assignment/roster) still decides visibility.
export async function loadAgentScriptSessions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  agentId: string
): Promise<ScriptSessionPayload[]> {
  const { data: segments } = await supabase
    .from("call_list_segments")
    .select("id, name, industry, call_script_text, leadgen_campaign_id")
    .eq("crm", "lead_generation")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return buildPayloads((segments ?? []) as SegmentLike[], agentId);
}

export type AgentScriptStatusEntry = {
  agentId: string;
  agentName: string;
  payload: ScriptSessionPayload;
  state: ScriptDisplayState;
  openedAt: string | null;
  lastActivityAt: string | null;
};

// Admin board: every active agent on an active list, with their live
// script state. Agents with no status row yet show "not opened yet".
export async function loadAgentScriptStatusBoard(): Promise<AgentScriptStatusEntry[]> {
  const admin = getSupabaseAdmin();
  const { data: segments } = await admin
    .from("call_list_segments")
    .select("id, name, industry, call_script_text, leadgen_campaign_id")
    .eq("crm", "lead_generation")
    .eq("status", "active");
  const payloads = await buildPayloads((segments ?? []) as SegmentLike[]);
  if (payloads.length === 0) return [];

  const campaignIds = [...new Set(payloads.map((p) => p.campaignId))];
  const [{ data: assignments }, { data: rosters }, { data: statuses }] = await Promise.all([
    admin.from("leadgen_campaign_agents").select("campaign_id, agent_id").in("campaign_id", campaignIds),
    admin.from("call_list_segment_agents").select("segment_id, agent_id").in("segment_id", payloads.map((p) => p.segmentId)),
    admin.from("leadgen_agent_script_status").select("*").in("segment_id", payloads.map((p) => p.segmentId)),
  ]);
  const agentIds = [...new Set((assignments ?? []).map((a) => a.agent_id as string))];
  const { data: agents } = agentIds.length
    ? await admin.from("leadgen_users").select("id, full_name, email").in("id", agentIds).eq("role", "agent").eq("active", true)
    : { data: [] };
  const agentById = new Map((agents ?? []).map((a) => [a.id as string, (a.full_name as string)?.trim() || (a.email as string)]));
  const rosterKey = new Set((rosters ?? []).map((r) => `${r.segment_id}:${r.agent_id}`));
  const assignedKey = new Set((assignments ?? []).map((a) => `${a.campaign_id}:${a.agent_id}`));
  const statusByKey = new Map((statuses ?? []).map((s) => [`${s.segment_id}:${s.agent_id}`, s as ScriptStatusRow]));

  const now = new Date();
  // One row per agent + campaign (an agent can have dozens of lists under one
  // campaign). The row shows the most relevant list's state: open beats
  // closed-while-working beats closed beats inactive beats never opened.
  const rank: Record<ScriptDisplayState, number> = { open: 4, closed_working: 3, closed: 2, inactive: 1, never_opened: 0 };
  const byAgentCampaign = new Map<string, AgentScriptStatusEntry>();
  for (const payload of payloads) {
    for (const [agentId, agentName] of agentById) {
      const key = `${payload.segmentId}:${agentId}`;
      if (!rosterKey.has(key) || !assignedKey.has(`${payload.campaignId}:${agentId}`)) continue;
      const row = statusByKey.get(key) ?? null;
      const entry: AgentScriptStatusEntry = { agentId, agentName, payload, state: deriveScriptDisplayState(row, now), openedAt: row?.opened_at ?? null, lastActivityAt: row?.last_activity_at ?? null };
      const groupKey = `${agentId}:${payload.campaignId}`;
      const existing = byAgentCampaign.get(groupKey);
      const better = !existing || rank[entry.state] > rank[existing.state] || (rank[entry.state] === rank[existing.state] && (entry.lastActivityAt ?? "") > (existing.lastActivityAt ?? ""));
      if (better) byAgentCampaign.set(groupKey, entry);
    }
  }
  return [...byAgentCampaign.values()].sort((a, b) => a.agentName.localeCompare(b.agentName) || a.payload.campaignName.localeCompare(b.payload.campaignName));
}
