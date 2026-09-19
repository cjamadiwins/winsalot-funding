import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { setSegmentAgents } from "./call-list-segments";
import type { CallListSegmentRow } from "./call-list-types";

// "Deploy / Assign Segment" (brief item 6): picks the segment's agent
// roster and flips it from Draft to Active in one step. Deploying again
// later (e.g. to reassign agents) is allowed and simply overwrites the
// roster and re-stamps deployed_at/deployed_by - the segment's leads and
// all call history are untouched either way.
export async function deploySegment(segmentId: string, agentIds: string[], deployedBy: string): Promise<CallListSegmentRow> {
  if (agentIds.length === 0) {
    throw new Error("Select at least one agent to deploy this segment to.");
  }

  await setSegmentAgents(segmentId, agentIds);

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("call_list_segments")
    .update({ status: "active", deployed_at: new Date().toISOString(), deployed_by: deployedBy })
    .eq("id", segmentId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to deploy the segment.");
  return data as CallListSegmentRow;
}
