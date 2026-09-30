import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { isAgentService, serviceAllowsOpportunityType, AGENT_SERVICE_LABELS, type AgentService } from "./crm-agent-service-shared";
import type { CallListSegmentRow } from "./call-list-types";
import { assertProductionCampaign } from "./leadgen-test-client-guard";
import { buildCallListCampaignName } from "./call-list-campaign-name";
import { GROWTH_CALL_LIST_OWNER } from "./growth-call-list-owner";

// Admin-only "Save Assignment" for a call list, shared by both CRMs' server
// actions (each action gates on its own requireAdmin first). Only the roster
// (call_list_segment_agents) and the list's service/client are ever written:
// call logs, leads, opportunities, follow-ups, appointments and notes are never
// touched, so history stays intact and re-adding an agent restores access
// without duplicating anything. Access itself is enforced separately by RLS.

type Admin = ReturnType<typeof getSupabaseAdmin>;

export type SaveAssignmentResult = { added: number; removed: number };

// Replace-set semantics, applied as a diff: an agent who stays on the list is
// never touched, so removing one agent can't affect another.
async function applyRosterDiff(admin: Admin, segmentId: string, agentIds: string[]): Promise<SaveAssignmentResult> {
  const wanted = [...new Set(agentIds)];
  const { data: current, error } = await admin.from("call_list_segment_agents").select("agent_id").eq("segment_id", segmentId);
  if (error) throw new Error(`Could not read the current assignment: ${error.message}`);
  const currentIds = (current ?? []).map((r) => r.agent_id as string);
  const toRemove = currentIds.filter((id) => !wanted.includes(id));
  const toAdd = wanted.filter((id) => !currentIds.includes(id));
  if (toRemove.length > 0) {
    const { error: delError } = await admin.from("call_list_segment_agents").delete().eq("segment_id", segmentId).in("agent_id", toRemove);
    if (delError) throw new Error(`Failed to remove agents: ${delError.message}`);
  }
  if (toAdd.length > 0) {
    const { error: insError } = await admin
      .from("call_list_segment_agents")
      .upsert(toAdd.map((agent_id) => ({ segment_id: segmentId, agent_id })), { onConflict: "segment_id,agent_id", ignoreDuplicates: true });
    if (insError) throw new Error(`Failed to add agents: ${insError.message}`);
  }
  return { added: toAdd.length, removed: toRemove.length };
}

// ---------------------------------------------------------------------------
// Growth CRM: Service + Agents. Agents must be eligible for the list's service
// under their Admin-set service assignment (Both may take either).
// ---------------------------------------------------------------------------

export const GROWTH_LIST_SERVICES = ["lead_generation", "business_financing"] as const;

export async function assertGrowthAgentsEligible(admin: Admin, service: string, agentIds: string[]): Promise<void> {
  if (agentIds.length === 0) return;
  const [{ data: users }, { data: assignments }] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email, role, active").in("id", agentIds),
    admin.from("crm_agent_service_assignments").select("agent_id, service").in("agent_id", agentIds),
  ]);
  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));
  const serviceByAgent = new Map((assignments ?? []).map((a) => [a.agent_id as string, a.service as string]));
  const problems: string[] = [];
  for (const id of agentIds) {
    const user = userById.get(id);
    const name = (user?.full_name as string) || (user?.email as string) || "An agent";
    if (!user || user.role !== "agent" || !user.active) problems.push(`${name} isn't an active agent.`);
    else {
      const assigned = serviceByAgent.get(id);
      const assignment: AgentService | null = isAgentService(assigned) ? assigned : null;
      if (!serviceAllowsOpportunityType(assignment, service)) {
        const label = service in AGENT_SERVICE_LABELS ? AGENT_SERVICE_LABELS[service as AgentService] : service === "both_services" ? "Both" : service;
        problems.push(`${name} isn't assigned to ${label}. Change their Service on the CRM Agents page first.`);
      }
    }
  }
  if (problems.length > 0) throw new Error(problems.join(" "));
}

export async function saveGrowthSegmentAssignment(segment: CallListSegmentRow, service: string, agentIds: string[]): Promise<SaveAssignmentResult> {
  if (segment.crm !== "growth") throw new Error("Call list not found.");
  // Legacy lists tagged "both services" may keep that tag; everything else is
  // Lead Generation or Business Finance. Growth CRM is Winsalot's internal
  // prospecting system, so prospects in crm_clients never own these lists.
  const keepsLegacy = service === "both_services" && segment.growth_opportunity_type === "both_services";
  if (!keepsLegacy && !(GROWTH_LIST_SERVICES as readonly string[]).includes(service)) throw new Error("Choose Lead Generation or Business Finance.");

  const admin = getSupabaseAdmin();
  await assertGrowthAgentsEligible(admin, service, agentIds);

  const campaignName = buildCallListCampaignName({
    clientName: GROWTH_CALL_LIST_OWNER,
    industry: segment.industry?.trim() || segment.name,
    location: segment.territory,
  });
  if (segment.growth_opportunity_type !== service || segment.crm_client_id !== null || segment.campaign_owner_name !== GROWTH_CALL_LIST_OWNER || segment.campaign_name !== campaignName) {
    // Only the list's fixed internal owner/service and roster change. Leads,
    // prospects, calls, notes, appointments, and all campaign history remain untouched.
    const { error } = await admin.from("call_list_segments").update({
      growth_opportunity_type: service,
      crm_client_id: null,
      campaign_owner_name: GROWTH_CALL_LIST_OWNER,
      campaign_name: campaignName,
    }).eq("id", segment.id);
    if (error) throw new Error(`Failed to update the call list assignment: ${error.message}`);
  }
  return applyRosterDiff(admin, segment.id, agentIds);
}

// ---------------------------------------------------------------------------
// Lead Generation CRM: Client (campaign) + Agents. Client assignment and list
// assignment are separate:
//   * Client assignment (leadgen_campaign_agents) = which clients an agent may
//     work for. Managed on the Admin dashboard (Agent Client Status).
//   * List assignment (call_list_segment_agents) = which specific lists under
//     that client the agent works. Managed here.
// Selecting an agent on a list also ensures the matching client scope row
// exists. Removing an agent from one list leaves any client scope and other
// list assignments intact; RLS still requires both for list visibility.
// ---------------------------------------------------------------------------
export async function saveLeadgenSegmentAssignment(segment: CallListSegmentRow, campaignId: string, agentIds: string[], selectedClientId?: string, assignedBy?: string): Promise<SaveAssignmentResult> {
  if (segment.crm !== "lead_generation") throw new Error("Call list not found.");
  const admin = getSupabaseAdmin();

  const { data: campaign } = await admin.from("leadgen_campaigns").select("id, client_id, status").eq("id", campaignId).maybeSingle();
  if (!campaign) throw new Error("That client/campaign no longer exists.");
  if (selectedClientId && campaign.client_id !== selectedClientId) throw new Error("The selected campaign doesn't belong to the selected client. Choose the campaign again.");
  await assertProductionCampaign(campaignId);
  if (campaign.status !== "active" && segment.leadgen_campaign_id !== campaignId) throw new Error("Choose an active campaign.");
  const { data: client } = await admin.from("leadgen_clients").select("id, name, active").eq("id", campaign.client_id).maybeSingle();
  if (!client || (!client.active && segment.leadgen_campaign_id !== campaignId)) throw new Error("That client isn't active.");
  const wanted = [...new Set(agentIds)];
  if (wanted.length > 0) {
    const { data: agents } = await admin.from("leadgen_users").select("id, full_name").in("id", wanted).eq("role", "agent").eq("active", true);
    const activeIds = new Set((agents ?? []).map((a) => a.id as string));
    if (wanted.some((id) => !activeIds.has(id))) throw new Error("One of the selected agents isn't an active agent.");
  }
  if (wanted.length > 0) {
    const { error } = await admin.from("leadgen_campaign_agents").upsert(
      wanted.map((agent_id) => ({ campaign_id: campaignId, agent_id, assigned_by: assignedBy ?? null })),
      { onConflict: "campaign_id,agent_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Failed to grant the selected agents access to this client: ${error.message}`);
  }

  const campaignName = buildCallListCampaignName({ clientName: client.name, industry: segment.industry, location: segment.territory });
  if (segment.leadgen_campaign_id !== campaignId || segment.campaign_name !== campaignName) {
    // Only affects work from now on: existing call logs, appointments, emails
    // and promoted leads keep the client they were recorded under.
    const { error } = await admin.from("call_list_segments").update({ leadgen_campaign_id: campaignId, campaign_name: campaignName }).eq("id", segment.id);
    if (error) throw new Error(`Failed to update the client: ${error.message}`);
  }
  return applyRosterDiff(admin, segment.id, wanted);
}
