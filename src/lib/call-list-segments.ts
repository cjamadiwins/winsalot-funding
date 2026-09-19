import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CallListCrm, CallListSegmentRow, CallListSegmentStatus } from "./call-list-types";

export async function listSegments(crm: CallListCrm): Promise<CallListSegmentRow[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("call_list_segments").select("*").eq("crm", crm).order("created_at", { ascending: false });
  return (data ?? []) as CallListSegmentRow[];
}

export async function getSegment(id: string): Promise<CallListSegmentRow | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("call_list_segments").select("*").eq("id", id).maybeSingle();
  return (data as CallListSegmentRow) ?? null;
}

// Authorization check for agent-facing Server Actions that otherwise go
// through the service-role client (call-list-leads.ts, call-list-
// promote.ts) - those helpers don't check RLS themselves, so any action
// callable by an agent must confirm here first that they're actually on
// this segment's roster and it's currently deployed, mirroring exactly
// what call_list_leads_*_agent_select's RLS policy already enforces for
// direct reads.
export async function isAgentAssignedToActiveSegment(segmentId: string, agentId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const segment = await getSegment(segmentId);
  if (!segment || segment.status === "draft") return false;
  const { data } = await admin
    .from("call_list_segment_agents")
    .select("agent_id")
    .eq("segment_id", segmentId)
    .eq("agent_id", agentId)
    .maybeSingle();
  return !!data;
}

export async function getSegmentAgentIds(segmentId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("call_list_segment_agents").select("agent_id").eq("segment_id", segmentId);
  return (data ?? []).map((row) => row.agent_id as string);
}

export async function setSegmentAgents(segmentId: string, agentIds: string[]): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("call_list_segment_agents").delete().eq("segment_id", segmentId);
  if (agentIds.length > 0) {
    await admin.from("call_list_segment_agents").insert(agentIds.map((agent_id) => ({ segment_id: segmentId, agent_id })));
  }
}

// Creates the segment's metadata row only, as a Draft - the uploaded
// rows themselves are inserted separately (see call-list-leads.ts's
// bulkInsertSegmentLeads), right after this, in the same upload action.
export async function createDraftSegment(input: {
  crm: CallListCrm;
  name: string;
  campaignName?: string | null;
  industry?: string | null;
  territory?: string | null;
  sourceFileName: string;
  sourceFileType: "csv" | "xlsx";
  growthOpportunityType?: string | null;
  leadgenCampaignId?: string | null;
  createdBy: string;
}): Promise<CallListSegmentRow> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("call_list_segments")
    .insert({
      crm: input.crm,
      name: input.name,
      campaign_name: input.campaignName ?? null,
      industry: input.industry ?? null,
      territory: input.territory ?? null,
      source_file_name: input.sourceFileName,
      source_file_type: input.sourceFileType,
      growth_opportunity_type: input.growthOpportunityType ?? null,
      leadgen_campaign_id: input.leadgenCampaignId ?? null,
      created_by: input.createdBy,
      status: "draft",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create the segment.");
  return data as CallListSegmentRow;
}

export async function setSegmentTotalUploadedRows(segmentId: string, total: number): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("call_list_segments").update({ total_uploaded_rows: total }).eq("id", segmentId);
}

export async function updateSegmentStatus(id: string, status: CallListSegmentStatus): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("call_list_segments").update({ status }).eq("id", id);
}

export async function deleteDraftSegment(id: string): Promise<void> {
  // call_list_leads rows cascade-delete with the segment (FK on delete
  // cascade) - safe here because this is only ever called on a segment
  // that's still a Draft (no deployment, no call history could exist).
  const admin = getSupabaseAdmin();
  await admin.from("call_list_segments").delete().eq("id", id).eq("status", "draft");
}
