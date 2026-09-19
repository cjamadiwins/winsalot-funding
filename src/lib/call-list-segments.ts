import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CallListCrm, CallListSegmentRow, CallListSyncRunRow } from "./call-list-types";
import type { CallListTargetField } from "./call-list-column-mapping";

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

export async function createSegment(input: {
  crm: CallListCrm;
  name: string;
  googleConnectionId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetTabName: string;
  sheetTabGid: number;
  columnMapping: Partial<Record<CallListTargetField, string>>;
  growthOpportunityType?: string | null;
  leadgenCampaignId?: string | null;
  createdBy: string;
  agentIds: string[];
}): Promise<CallListSegmentRow> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("call_list_segments")
    .insert({
      crm: input.crm,
      name: input.name,
      google_connection_id: input.googleConnectionId,
      spreadsheet_id: input.spreadsheetId,
      spreadsheet_url: input.spreadsheetUrl,
      sheet_tab_name: input.sheetTabName,
      sheet_tab_gid: input.sheetTabGid,
      column_mapping: input.columnMapping,
      growth_opportunity_type: input.growthOpportunityType ?? null,
      leadgen_campaign_id: input.leadgenCampaignId ?? null,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create the segment.");

  const segment = data as CallListSegmentRow;
  if (input.agentIds.length > 0) {
    await admin.from("call_list_segment_agents").insert(input.agentIds.map((agent_id) => ({ segment_id: segment.id, agent_id })));
  }
  return segment;
}

export async function updateSegmentStatus(id: string, status: "active" | "paused" | "disconnected"): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("call_list_segments").update({ status }).eq("id", id);
}

export async function listSyncRuns(segmentId: string, limit = 10): Promise<CallListSyncRunRow[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("call_list_sync_runs")
    .select("*")
    .eq("segment_id", segmentId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CallListSyncRunRow[];
}
