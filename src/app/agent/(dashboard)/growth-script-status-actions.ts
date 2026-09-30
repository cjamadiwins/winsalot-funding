"use server";

import { requireCrmUser } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAgentAssignedToActiveSegment } from "@/lib/call-list-segments";
import { toGrowthScriptPayload } from "@/lib/growth-script-sessions";
import { planScriptStateUpdate, type ScriptStatusRow } from "@/lib/leadgen-script-status";
import { notifyAdminsOfGrowthScriptState } from "@/lib/growth-script-notifications";

// Records only the script-panel state (open/closed, whether the agent is on
// their call list) for the signed-in Growth agent and a list they are assigned
// to. The list and its service are resolved server-side - never taken from the
// browser. Written with the service role because agents have no write access to
// crm_agent_script_status; admins are notified only on a meaningful state
// change (see planScriptStateUpdate).
export async function reportGrowthScriptStateAction(input: { segmentId: string; open: boolean; working: boolean }): Promise<{ ok: boolean }> {
  const agent = await requireCrmUser();
  if (agent.role !== "agent") return { ok: false };
  if (typeof input.segmentId !== "string" || typeof input.open !== "boolean" || typeof input.working !== "boolean") return { ok: false };
  if (!(await isAgentAssignedToActiveSegment(input.segmentId, agent.id))) return { ok: false };

  const admin = getSupabaseAdmin();
  const { data: segment } = await admin
    .from("call_list_segments")
    .select("id, name, campaign_name, crm, status, growth_opportunity_type, call_script_key, call_script_text")
    .eq("id", input.segmentId)
    .maybeSingle();
  if (!segment || segment.crm !== "growth" || segment.status !== "active") return { ok: false };
  const payload = toGrowthScriptPayload(segment);
  if (!payload) return { ok: false };

  const { data: existing } = await admin.from("crm_agent_script_status").select("*").eq("agent_id", agent.id).eq("segment_id", input.segmentId).maybeSingle();
  const { patch, notify } = planScriptStateUpdate((existing as ScriptStatusRow | null) ?? null, { open: input.open, working: input.working }, new Date());

  const { error } = await admin
    .from("crm_agent_script_status")
    .upsert({ agent_id: agent.id, segment_id: input.segmentId, service_key: payload.serviceKey, ...patch, updated_at: new Date().toISOString() }, { onConflict: "agent_id,segment_id" });
  if (error) {
    console.error("[growth-script-status] upsert failed:", error);
    return { ok: false };
  }

  const agentName = agent.full_name.trim() || agent.email;
  for (const kind of notify) {
    await notifyAdminsOfGrowthScriptState({ kind, agentName, serviceLabel: payload.serviceLabel, listName: payload.segmentName });
  }
  return { ok: true };
}
