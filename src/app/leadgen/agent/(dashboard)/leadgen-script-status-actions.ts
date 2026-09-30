"use server";

import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAgentAssignedToActiveSegment } from "@/lib/call-list-segments";
import { resolveSegmentAssignment } from "@/lib/leadgen-campaign-assignment";
import { planScriptStateUpdate, type ScriptStatusRow } from "@/lib/leadgen-script-status";
import { notifyAdminsOfScriptState } from "@/lib/leadgen-script-notifications";
import type { CallListSegmentRow } from "@/lib/call-list-types";

// Records only the CRM script-panel state (open/closed, whether the agent is
// on their call list) for the signed-in agent and a list they are assigned
// to. Client and campaign are resolved server-side from the list - never
// taken from the browser. Written with the service role because agents have
// no write access to leadgen_agent_script_status; admins are notified only on
// a meaningful state change (see planScriptStateUpdate).
export async function reportLeadgenScriptStateAction(input: { segmentId: string; open: boolean; working: boolean }): Promise<{ ok: boolean }> {
  const agent = await requireLeadgenAgent();
  if (typeof input.segmentId !== "string" || typeof input.open !== "boolean" || typeof input.working !== "boolean") return { ok: false };
  if (!(await isAgentAssignedToActiveSegment(input.segmentId, agent.id))) return { ok: false };

  const admin = getSupabaseAdmin();
  const { data: segment } = await admin.from("call_list_segments").select("*").eq("id", input.segmentId).maybeSingle();
  if (!segment) return { ok: false };
  const assignment = await resolveSegmentAssignment(segment as CallListSegmentRow);
  if (assignment.state !== "assigned") return { ok: false };

  const { data: existing } = await admin.from("leadgen_agent_script_status").select("*").eq("agent_id", agent.id).eq("segment_id", input.segmentId).maybeSingle();
  const { patch, notify } = planScriptStateUpdate((existing as ScriptStatusRow | null) ?? null, { open: input.open, working: input.working }, new Date());

  const { error } = await admin.from("leadgen_agent_script_status").upsert(
    { agent_id: agent.id, segment_id: input.segmentId, client_id: assignment.clientId, campaign_id: assignment.campaignId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "agent_id,segment_id" }
  );
  if (error) {
    console.error("[leadgen-script-status] upsert failed:", error);
    return { ok: false };
  }

  const agentName = agent.full_name.trim() || agent.email;
  for (const kind of notify) {
    await notifyAdminsOfScriptState({ kind, agentName, clientName: assignment.clientName, listName: (segment as CallListSegmentRow).name });
  }
  return { ok: true };
}
