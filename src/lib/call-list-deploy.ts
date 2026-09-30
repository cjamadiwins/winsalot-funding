import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getSegment, setSegmentAgents } from "./call-list-segments";
import type { CallListSegmentRow } from "./call-list-types";
import { assertGrowthAgentsEligible, assertLeadgenAgentsAssignedToCampaign } from "./call-list-assignment";

// "Deploy / Assign Segment" (brief item 6): picks the segment's agent
// roster and flips it from Draft to Active in one step. Deploying again
// later (e.g. to reassign agents) is allowed and simply overwrites the
// roster and re-stamps deployed_at/deployed_by - the segment's leads and
// all call history are untouched either way.
export async function deploySegment(segmentId: string, agentIds: string[], deployedBy: string): Promise<CallListSegmentRow> {
  if (agentIds.length === 0) {
    throw new Error("Select at least one agent to deploy this segment to.");
  }

  const admin = getSupabaseAdmin();
  const segment = await getSegment(segmentId);
  if (segment?.crm === "lead_generation") {
    const { data: campaign } = await admin.from("leadgen_campaigns").select("client_id, status").eq("id", segment.leadgen_campaign_id).maybeSingle();
    if (!campaign || campaign.status !== "active") throw new Error("This campaign is inactive.");
    const { data: client } = await admin.from("leadgen_clients").select("id").eq("id", campaign.client_id).eq("active", true).maybeSingle();
    if (!client) throw new Error("This campaign's client is inactive.");
    // Client assignment is separate from list assignment: agents must already hold this client.
    await assertLeadgenAgentsAssignedToCampaign(admin, segment.leadgen_campaign_id as string, agentIds);
  }
  // Growth: agents must be eligible for the list's service (Admin's Service assignment).
  if (segment?.crm === "growth" && segment.growth_opportunity_type) {
    await assertGrowthAgentsEligible(admin, segment.growth_opportunity_type, agentIds);
  }
  await setSegmentAgents(segmentId, agentIds);
  const { data, error } = await admin
    .from("call_list_segments")
    .update({ status: "active", deployed_at: new Date().toISOString(), deployed_by: deployedBy })
    .eq("id", segmentId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to deploy the segment.");
  return data as CallListSegmentRow;
}
