import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { createSupabaseServerClient } from "./supabase-server";
import { GROWTH_CRM_CAMPAIGN_LABELS } from "./growth-crm-campaign-scripts";
import { resolveGrowthScriptKey } from "./call-list-script-shared";
import { deriveScriptDisplayState, type ScriptDisplayState, type ScriptStatusRow } from "./leadgen-script-status";
import type { GrowthScriptSessionPayload } from "./growth-script-session-types";

type SegmentLike = {
  id: string;
  name: string;
  campaign_name: string | null;
  growth_opportunity_type: string | null;
  call_script_key: string | null;
  call_script_text: string | null;
};

const SEGMENT_FIELDS = "id, name, campaign_name, growth_opportunity_type, call_script_key, call_script_text";

// Only lists that actually have an approved script (template or Admin text).
export function toGrowthScriptPayload(segment: SegmentLike): GrowthScriptSessionPayload | null {
  const serviceKey = resolveGrowthScriptKey(segment);
  const scriptText = segment.call_script_text?.trim() || null;
  if (!serviceKey && !scriptText) return null;
  return {
    segmentId: segment.id,
    segmentName: segment.name,
    campaignName: segment.campaign_name,
    serviceKey,
    serviceLabel: serviceKey ? GROWTH_CRM_CAMPAIGN_LABELS[serviceKey] : "Custom call script",
    scriptText,
  };
}

// The signed-in agent's own active Growth lists. Visibility is decided by the
// session-scoped client (existing assignment/service RLS), never service role.
export async function loadGrowthAgentScriptSessions(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<GrowthScriptSessionPayload[]> {
  const { data } = await supabase.from("call_list_segments").select(SEGMENT_FIELDS).eq("crm", "growth").eq("status", "active").order("created_at", { ascending: false });
  return ((data ?? []) as SegmentLike[]).flatMap((s) => {
    const payload = toGrowthScriptPayload(s);
    return payload ? [payload] : [];
  });
}

export type GrowthAgentScriptStatusEntry = {
  agentId: string;
  agentName: string;
  payload: GrowthScriptSessionPayload;
  state: ScriptDisplayState;
  openedAt: string | null;
  lastActivityAt: string | null;
  listCount: number;
};

// Admin board: every agent rostered on an active Growth list that has a script,
// grouped per agent + service so it stays compact. Open beats closed-while-
// working beats closed beats inactive beats never opened.
export async function loadGrowthAgentScriptStatusBoard(): Promise<GrowthAgentScriptStatusEntry[]> {
  const admin = getSupabaseAdmin();
  const { data: segments } = await admin.from("call_list_segments").select(SEGMENT_FIELDS).eq("crm", "growth").eq("status", "active");
  const payloads = ((segments ?? []) as SegmentLike[]).flatMap((s) => {
    const p = toGrowthScriptPayload(s);
    return p ? [p] : [];
  });
  if (payloads.length === 0) return [];
  const segmentIds = payloads.map((p) => p.segmentId);
  const [{ data: rosters }, { data: statuses }] = await Promise.all([
    admin.from("call_list_segment_agents").select("segment_id, agent_id").in("segment_id", segmentIds),
    admin.from("crm_agent_script_status").select("*").in("segment_id", segmentIds),
  ]);
  const agentIds = [...new Set((rosters ?? []).map((r) => r.agent_id as string))];
  const { data: agents } = agentIds.length
    ? await admin.from("crm_users").select("id, full_name, email").in("id", agentIds).eq("role", "agent").eq("active", true)
    : { data: [] };
  const agentName = new Map((agents ?? []).map((a) => [a.id as string, (a.full_name as string)?.trim() || (a.email as string)]));
  const statusByKey = new Map((statuses ?? []).map((s) => [`${s.segment_id}:${s.agent_id}`, s as ScriptStatusRow]));
  const payloadBySegment = new Map(payloads.map((p) => [p.segmentId, p]));

  const rank: Record<ScriptDisplayState, number> = { open: 4, closed_working: 3, closed: 2, inactive: 1, never_opened: 0 };
  const now = new Date();
  const groups = new Map<string, GrowthAgentScriptStatusEntry>();
  for (const roster of rosters ?? []) {
    const name = agentName.get(roster.agent_id as string);
    const payload = payloadBySegment.get(roster.segment_id as string);
    if (!name || !payload) continue;
    const row = statusByKey.get(`${payload.segmentId}:${roster.agent_id}`) ?? null;
    const entry: GrowthAgentScriptStatusEntry = {
      agentId: roster.agent_id as string,
      agentName: name,
      payload,
      state: deriveScriptDisplayState(row, now),
      openedAt: row?.opened_at ?? null,
      lastActivityAt: row?.last_activity_at ?? null,
      listCount: 1,
    };
    const key = `${entry.agentId}:${payload.serviceLabel}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, entry);
      continue;
    }
    const better = rank[entry.state] > rank[existing.state] || (rank[entry.state] === rank[existing.state] && (entry.lastActivityAt ?? "") > (existing.lastActivityAt ?? ""));
    groups.set(key, { ...(better ? entry : existing), listCount: existing.listCount + 1 });
  }
  return [...groups.values()].sort((a, b) => a.agentName.localeCompare(b.agentName) || a.payload.serviceLabel.localeCompare(b.payload.serviceLabel));
}
