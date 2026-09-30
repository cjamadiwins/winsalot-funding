import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getAgentServiceAssignment } from "./crm-agent-service";
import { serviceAllowsOpportunityType } from "./crm-agent-service-shared";
import type { CallListCrm, CallListLeadRow, CallListSegmentRow, CallListSegmentStatus } from "./call-list-types";
import { buildCallListCampaignName } from "./call-list-campaign-name";

const GROWTH_CAMPAIGN_OWNER = "Winsalot Corp";

export async function listSegments(crm: CallListCrm): Promise<CallListSegmentRow[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("call_list_segments").select("*").eq("crm", crm).order("created_at", { ascending: false });
  return (data ?? []) as CallListSegmentRow[];
}

export type CallListSegmentPerformance = {
  totalLeads: number;
  leadsRemaining: number;
  interested: number;
  appointmentsBooked: number;
  promoted: number;
};

export type CampaignSegmentPerformanceRow = { segment: CallListSegmentRow; stats: CallListSegmentPerformance };

// Reporting (Growth/Lead Gen campaign detail page): "Performance by
// individual industry/segment" alongside the campaign's own combined
// totals, without duplicating the fuller per-segment stats already
// computed in the segment detail page loader. A campaign can have any
// number of industry/territory segments (never hardcoded to a fixed
// list - see call_list_segments.industry, a free-text column) - this
// walks all of them in two queries total, not one per segment.
export async function getCampaignSegmentPerformance(campaignId: string): Promise<CampaignSegmentPerformanceRow[]> {
  const admin = getSupabaseAdmin();
  const { data: segments } = await admin
    .from("call_list_segments")
    .select("*")
    .eq("leadgen_campaign_id", campaignId)
    .order("industry", { ascending: true })
    .order("name", { ascending: true });
  const segmentRows = (segments ?? []) as CallListSegmentRow[];
  if (segmentRows.length === 0) return [];

  const segmentIds = segmentRows.map((s) => s.id);
  const { data: leads } = await admin
    .from("call_list_leads")
    .select("segment_id, last_outcome, promoted_leadgen_lead_id")
    .in("segment_id", segmentIds)
    .is("removed_at", null);

  const statsBySegment = new Map<string, CallListSegmentPerformance>();
  for (const lead of (leads ?? []) as Pick<CallListLeadRow, "segment_id" | "last_outcome" | "promoted_leadgen_lead_id">[]) {
    const stats = statsBySegment.get(lead.segment_id) ?? { totalLeads: 0, leadsRemaining: 0, interested: 0, appointmentsBooked: 0, promoted: 0 };
    stats.totalLeads += 1;
    if (!lead.last_outcome) stats.leadsRemaining += 1;
    if (lead.last_outcome === "Interested") stats.interested += 1;
    if (lead.last_outcome === "Appointment Booked") stats.appointmentsBooked += 1;
    if (lead.promoted_leadgen_lead_id) stats.promoted += 1;
    statsBySegment.set(lead.segment_id, stats);
  }

  return segmentRows.map((segment) => ({
    segment,
    stats: statsBySegment.get(segment.id) ?? { totalLeads: 0, leadsRemaining: 0, interested: 0, appointmentsBooked: 0, promoted: 0 },
  }));
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
  if (segment.crm === "lead_generation") {
    if (!segment.leadgen_campaign_id) return false;
    const { data: campaign } = await admin.from("leadgen_campaigns").select("client_id, status").eq("id", segment.leadgen_campaign_id).maybeSingle();
    if (!campaign || campaign.status !== "active") return false;
    const { data: client } = await admin.from("leadgen_clients").select("id").eq("id", campaign.client_id).eq("active", true).maybeSingle();
    if (!client) return false;
    // Admin removed this client from the agent: the list roster is kept for
    // history/re-assignment but gives no access while unassigned.
    const { data: assignedRow } = await admin
      .from("leadgen_campaign_agents")
      .select("id")
      .eq("agent_id", agentId)
      .eq("campaign_id", segment.leadgen_campaign_id)
      .maybeSingle();
    if (!assignedRow) return false;
  }
  // Growth CRM: Admin's service assignment decides which lists an agent may
  // work; the roster row alone is not enough (it is kept when the assignment
  // changes so re-assigning restores access untouched). Lead Gen is unaffected.
  if (segment.crm === "growth") {
    const service = await getAgentServiceAssignment(agentId);
    if (!serviceAllowsOpportunityType(service, segment.growth_opportunity_type ?? "")) return false;
  }
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
      campaign_name: input.crm === "growth"
        ? buildCallListCampaignName({ clientName: GROWTH_CAMPAIGN_OWNER, industry: input.industry?.trim() || input.name, location: input.territory ?? null })
        : input.campaignName ?? null,
      campaign_owner_name: input.crm === "growth" ? GROWTH_CAMPAIGN_OWNER : null,
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
