"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ActionResult = { error?: string; removedFromLists?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Admin-only, enforced here (requireLeadgenAdmin) and by RLS on the
// underlying tables (leadgen_campaign_agents / call_list_segment_agents /
// call_list_segments have admin-only write policies and only a select-own
// policy for agents) - an agent can never change campaign ownership.

function refresh() {
  revalidatePath("/leadgen/admin/assignments");
  revalidatePath("/leadgen/admin");
  revalidatePath("/leadgen/admin/call-list-segments");
  revalidatePath("/leadgen/agent/call-list-segments");
}

async function assertActiveAgent(admin: ReturnType<typeof getSupabaseAdmin>, agentId: string): Promise<boolean> {
  const { data } = await admin.from("leadgen_users").select("id").eq("id", agentId).eq("role", "agent").eq("active", true).maybeSingle();
  return !!data;
}

// Client/Campaign -> Agent. Removing an agent from a campaign optionally
// also takes them off that campaign's call lists, so they can't keep
// working a client they were just unassigned from.
export async function setCampaignAgentAction(campaignId: string, agentId: string, assigned: boolean, alsoRemoveFromLists = false): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  if (!UUID.test(campaignId) || !UUID.test(agentId)) return { error: "Invalid request." };
  const db = getSupabaseAdmin();

  if (assigned) {
    if (!(await assertActiveAgent(db, agentId))) return { error: "That agent isn't active." };
    const { error } = await db
      .from("leadgen_campaign_agents")
      .upsert({ campaign_id: campaignId, agent_id: agentId, assigned_by: admin.id }, { onConflict: "campaign_id,agent_id", ignoreDuplicates: true });
    if (error) return { error: `Failed to assign the agent: ${error.message}` };
    refresh();
    return {};
  }

  const { error } = await db.from("leadgen_campaign_agents").delete().eq("campaign_id", campaignId).eq("agent_id", agentId);
  if (error) return { error: `Failed to remove the assignment: ${error.message}` };

  let removedFromLists = 0;
  if (alsoRemoveFromLists) {
    const { data: segments } = await db.from("call_list_segments").select("id").eq("crm", "lead_generation").eq("leadgen_campaign_id", campaignId);
    const segmentIds = (segments ?? []).map((s) => s.id as string);
    if (segmentIds.length > 0) {
      const { data: removed, error: removeError } = await db.from("call_list_segment_agents").delete().eq("agent_id", agentId).in("segment_id", segmentIds).select("segment_id");
      if (removeError) return { error: `Removed from the client, but failed to remove from its call lists: ${removeError.message}` };
      removedFromLists = removed?.length ?? 0;
    }
  }
  refresh();
  return { removedFromLists };
}

// Call List -> Agent. Assigning an agent to a list on a campaign also makes
// them an agent on that campaign (so the client shows up in their own
// client list), never the other way around.
export async function setSegmentAgentAction(segmentId: string, agentId: string, assigned: boolean): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  if (!UUID.test(segmentId) || !UUID.test(agentId)) return { error: "Invalid request." };
  const db = getSupabaseAdmin();

  const { data: segment } = await db.from("call_list_segments").select("id, leadgen_campaign_id").eq("id", segmentId).eq("crm", "lead_generation").maybeSingle();
  if (!segment) return { error: "Call list not found." };

  if (assigned) {
    if (!(await assertActiveAgent(db, agentId))) return { error: "That agent isn't active." };
    const { error } = await db.from("call_list_segment_agents").upsert({ segment_id: segmentId, agent_id: agentId }, { onConflict: "segment_id,agent_id", ignoreDuplicates: true });
    if (error) return { error: `Failed to assign the agent: ${error.message}` };
    if (segment.leadgen_campaign_id) {
      await db
        .from("leadgen_campaign_agents")
        .upsert({ campaign_id: segment.leadgen_campaign_id, agent_id: agentId, assigned_by: admin.id }, { onConflict: "campaign_id,agent_id", ignoreDuplicates: true });
    }
  } else {
    const { error } = await db.from("call_list_segment_agents").delete().eq("segment_id", segmentId).eq("agent_id", agentId);
    if (error) return { error: `Failed to remove the agent: ${error.message}` };
  }
  refresh();
  return {};
}

// Call List -> Client/Campaign (assign, change, or clear). Only affects work
// done from now on: existing call logs, appointments, emails and already-
// promoted leads keep the client they were recorded under, so historical
// reporting never changes retroactively.
export async function setSegmentCampaignAction(segmentId: string, campaignId: string | null): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  if (!UUID.test(segmentId) || (campaignId !== null && !UUID.test(campaignId))) return { error: "Invalid request." };
  const db = getSupabaseAdmin();

  const { data: segment } = await db.from("call_list_segments").select("id").eq("id", segmentId).eq("crm", "lead_generation").maybeSingle();
  if (!segment) return { error: "Call list not found." };

  if (campaignId) {
    const { data: campaign } = await db.from("leadgen_campaigns").select("id").eq("id", campaignId).maybeSingle();
    if (!campaign) return { error: "That campaign no longer exists." };
  }

  const { error } = await db.from("call_list_segments").update({ leadgen_campaign_id: campaignId }).eq("id", segmentId);
  if (error) return { error: `Failed to update the call list: ${error.message}` };

  // Agents already on this list get access to the new client too.
  if (campaignId) {
    const { data: onList } = await db.from("call_list_segment_agents").select("agent_id").eq("segment_id", segmentId);
    const rows = (onList ?? []).map((r) => ({ campaign_id: campaignId, agent_id: r.agent_id as string, assigned_by: admin.id }));
    if (rows.length > 0) await db.from("leadgen_campaign_agents").upsert(rows, { onConflict: "campaign_id,agent_id", ignoreDuplicates: true });
  }
  refresh();
  return {};
}
