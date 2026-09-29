"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listSelectableActiveClients } from "@/lib/leadgen-agent-active-client";
import { ensureRestrictedAgentOnCampaign } from "@/lib/leadgen-campaign-assignment";
import { assignmentWouldRestrictAgent, removalWouldUnrestrictAgent } from "@/lib/leadgen-agent-active-client";

type ActionResult = { error?: string; removedFromLists?: number; remainingLists?: number };

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
    if (segment.leadgen_campaign_id) await ensureRestrictedAgentOnCampaign(segment.leadgen_campaign_id, agentId, admin.id);
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
    for (const row of onList ?? []) await ensureRestrictedAgentOnCampaign(campaignId, row.agent_id as string, admin.id);
  }
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Agent Client Status (admin dashboard): multiple clients per agent plus one
// Primary/Current client.
//
// Assignments reuse the existing leadgen_campaign_agents rows (an agent is
// assigned to a client when they have a row on that client's campaigns); the
// Primary client is the existing leadgen_users.current_campaign_id. These
// actions only ever change those assignment rows - never a call log, lead,
// appointment, email or report - so everything recorded earlier keeps the
// client it was created under. Admin-only (agents have no write path).
//
// Attribution priority is unchanged and lives elsewhere: an explicit call-list
// client always wins, then the Primary client, then no selection.
// ---------------------------------------------------------------------------

async function campaignIdsForClient(db: ReturnType<typeof getSupabaseAdmin>, clientId: string): Promise<string[]> {
  const { data } = await db.from("leadgen_campaigns").select("id").eq("client_id", clientId);
  return (data ?? []).map((c) => c.id as string);
}

async function agentCampaignRows(db: ReturnType<typeof getSupabaseAdmin>, agentId: string): Promise<{ id: string; campaign_id: string }[]> {
  const { data } = await db.from("leadgen_campaign_agents").select("id, campaign_id").eq("agent_id", agentId);
  return (data ?? []) as { id: string; campaign_id: string }[];
}

// Assign a client to an agent: adds the agent to all of that client's
// campaigns. Going from "no assignments" (the agent can see every client) to
// one assignment restricts them to only assigned clients, so that transition
// needs an explicit confirmation.
export async function assignAgentClientAction(agentId: string, clientId: string, confirmed = false): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  if (!UUID.test(agentId) || !UUID.test(clientId)) return { error: "Invalid request." };
  const db = getSupabaseAdmin();
  if (!(await assertActiveAgent(db, agentId))) return { error: "That agent isn't active." };
  if (!(await listSelectableActiveClients()).some((c) => c.id === clientId)) return { error: "That client isn't an active client." };

  const campaignIds = await campaignIdsForClient(db, clientId);
  if (campaignIds.length === 0) return { error: "That client has no campaigns yet." };

  const rows = await agentCampaignRows(db, agentId);
  if (assignmentWouldRestrictAgent(rows.length) && !confirmed) {
    return { error: "This agent can currently see every client. Assigning a client limits them to only their assigned clients - confirm to continue." };
  }

  const { error } = await db
    .from("leadgen_campaign_agents")
    .upsert(campaignIds.map((campaign_id) => ({ campaign_id, agent_id: agentId, assigned_by: admin.id })), { onConflict: "campaign_id,agent_id", ignoreDuplicates: true });
  if (error) return { error: `Failed to assign the client: ${error.message}` };

  refresh();
  revalidatePath("/leadgen/agent");
  return {};
}

// Remove a client from an agent. Deletes only the agent's campaign
// assignments for that client. Nothing recorded under the client is touched,
// and the agent's call-list roster is left alone (the count still on a list is
// returned so Admin can decide). If it was the Primary client, Primary is
// cleared. Removing an agent's last assignment makes them unrestricted, so
// that needs an explicit confirmation.
export async function removeAgentClientAction(agentId: string, clientId: string, confirmed = false): Promise<ActionResult> {
  await requireLeadgenAdmin();
  if (!UUID.test(agentId) || !UUID.test(clientId)) return { error: "Invalid request." };
  const db = getSupabaseAdmin();

  const campaignIds = await campaignIdsForClient(db, clientId);
  const rows = await agentCampaignRows(db, agentId);
  const clientRows = rows.filter((r) => campaignIds.includes(r.campaign_id));

  if (clientRows.length > 0 && removalWouldUnrestrictAgent(rows.length, clientRows.length) && !confirmed) {
    return { error: "This is the agent's last assigned client. With none assigned they can see every client - confirm to continue." };
  }

  if (clientRows.length > 0) {
    const { error } = await db.from("leadgen_campaign_agents").delete().eq("agent_id", agentId).in("campaign_id", campaignIds);
    if (error) return { error: `Failed to remove the client: ${error.message}` };
  }

  // Primary/Current pointing at this client is cleared.
  const { data: user } = await db.from("leadgen_users").select("current_campaign_id").eq("id", agentId).maybeSingle();
  if (user?.current_campaign_id && campaignIds.includes(user.current_campaign_id as string)) {
    await db.from("leadgen_users").update({ current_campaign_id: null }).eq("id", agentId).eq("role", "agent");
  }

  const { data: segments } = campaignIds.length
    ? await db.from("call_list_segments").select("id").eq("crm", "lead_generation").in("leadgen_campaign_id", campaignIds)
    : { data: [] as { id: string }[] };
  const segmentIds = (segments ?? []).map((s) => s.id as string);
  const { count } = segmentIds.length
    ? await db.from("call_list_segment_agents").select("segment_id", { count: "exact", head: true }).eq("agent_id", agentId).in("segment_id", segmentIds)
    : { count: 0 };

  refresh();
  revalidatePath("/leadgen/agent");
  return { remainingLists: count ?? 0 };
}

// Set or clear the agent's Primary/Current client. It's a default only: a call
// list that belongs to a specific client always wins. A campaign-restricted
// agent's Primary must be one of their assigned clients; an unrestricted agent
// (no assignments) can still have one without being restricted.
export async function setAgentActiveClientAction(agentId: string, clientId: string | null): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  if (!UUID.test(agentId) || (clientId !== null && !UUID.test(clientId))) return { error: "Invalid request." };
  const db = getSupabaseAdmin();
  if (!(await assertActiveAgent(db, agentId))) return { error: "That agent isn't active." };

  let campaignId: string | null = null;
  if (clientId) {
    const option = (await listSelectableActiveClients()).find((c) => c.id === clientId);
    if (!option) return { error: "That client isn't an active client." };

    const rows = await agentCampaignRows(db, agentId);
    if (rows.length > 0) {
      const clientCampaigns = await campaignIdsForClient(db, clientId);
      if (!rows.some((r) => clientCampaigns.includes(r.campaign_id))) return { error: "Assign this client to the agent before making it their Primary client." };
    }

    // Already the Primary client (e.g. saved on one of its other campaigns)?
    // Keep the existing campaign rather than rewriting it.
    const { data: current } = await db.from("leadgen_users").select("current_campaign_id").eq("id", agentId).maybeSingle();
    const clientCampaignIds = await campaignIdsForClient(db, clientId);
    if (current?.current_campaign_id && clientCampaignIds.includes(current.current_campaign_id as string)) {
      refresh();
      return {};
    }

    campaignId = option.campaignId;
    // A restricted agent needs access to the Primary campaign itself to see
    // its leads; an unrestricted agent already sees everything.
    await ensureRestrictedAgentOnCampaign(campaignId, agentId, admin.id);
  }

  const { data: updated, error } = await db
    .from("leadgen_users")
    .update({ current_campaign_id: campaignId })
    .eq("id", agentId)
    .eq("role", "agent")
    .select("id");
  if (error) return { error: `Failed to save the agent's Primary client: ${error.message}` };
  if (!updated || updated.length === 0) return { error: "Agent not found." };

  refresh();
  revalidatePath("/leadgen/agent");
  return {};
}
