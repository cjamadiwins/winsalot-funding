import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CallListSegmentRow } from "./call-list-types";

// Lead Generation CRM: which client an agent is calling for is decided by
// the call list, never by an agent-chosen default. The chain is
//   call_list_segments.leadgen_campaign_id -> leadgen_campaigns.client_id
// (existing columns). Agents on a list come from call_list_segment_agents,
// agents on a client's campaign from leadgen_campaign_agents.

export type SegmentAssignment =
  | { state: "assigned"; clientId: string; clientName: string; campaignId: string; campaignName: string; isInternalTest: boolean }
  | { state: "unassigned" }
  | { state: "inactive"; clientName: string; campaignName: string; reason: "campaign_paused" | "client_inactive" };

export const CAMPAIGN_ASSIGNMENT_REQUIRED_MESSAGE =
  "Campaign Assignment Required - this call list isn't assigned to a client/campaign yet. Ask Admin to assign it before making client-specific calls, emails or bookings.";

export async function resolveSegmentAssignment(segment: Pick<CallListSegmentRow, "leadgen_campaign_id">): Promise<SegmentAssignment> {
  if (!segment.leadgen_campaign_id) return { state: "unassigned" };
  const admin = getSupabaseAdmin();
  const { data: campaign } = await admin.from("leadgen_campaigns").select("id, name, status, client_id").eq("id", segment.leadgen_campaign_id).maybeSingle();
  if (!campaign) return { state: "unassigned" };
  const { data: client } = await admin.from("leadgen_clients").select("id, name, active, is_internal_test").eq("id", campaign.client_id).maybeSingle();
  if (!client) return { state: "unassigned" };
  if (!client.active) return { state: "inactive", clientName: client.name, campaignName: campaign.name, reason: "client_inactive" };
  if (campaign.status !== "active") return { state: "inactive", clientName: client.name, campaignName: campaign.name, reason: "campaign_paused" };
  return {
    state: "assigned",
    clientId: client.id,
    clientName: client.name,
    campaignId: campaign.id,
    campaignName: campaign.name,
    isInternalTest: client.is_internal_test === true,
  };
}

export type AssignmentOverview = {
  agents: { id: string; name: string }[];
  campaigns: {
    id: string;
    name: string;
    status: string;
    clientId: string;
    clientName: string;
    clientActive: boolean;
    isInternalTest: boolean;
    agentIds: string[];
  }[];
  segments: {
    id: string;
    name: string;
    status: CallListSegmentRow["status"];
    industry: string | null;
    territory: string | null;
    campaignId: string | null;
    agentIds: string[];
    leadCount: number;
    callLogCount: number;
  }[];
};

// One read of everything the admin Client Assignments screen (and the
// dashboard's unassigned-list indicator) needs.
// PostgREST caps a plain select at 1000 rows and call_list_leads is far
// larger, so per-segment lead counts are read in pages. Only the admin
// assignment screen needs them (withCounts) - the dashboard indicator doesn't.
async function fetchSegmentIdPages(table: "call_list_leads" | "leadgen_call_logs", column: "segment_id" | "call_list_segment_id"): Promise<{ [k: string]: string | null }[]> {
  const admin = getSupabaseAdmin();
  const rows: { [k: string]: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    let query = admin.from(table).select(column).not(column, "is", null).order("id").range(from, from + 999);
    if (table === "call_list_leads") query = query.is("removed_at", null);
    const { data } = await query;
    const page = (data ?? []) as unknown as { [k: string]: string | null }[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export async function loadAssignmentOverview(options: { withCounts?: boolean } = {}): Promise<AssignmentOverview> {
  const admin = getSupabaseAdmin();
  const withCounts = options.withCounts !== false;
  const [{ data: agents }, { data: campaigns }, { data: clients }, { data: campaignAgents }, { data: segments }, { data: segmentAgents }, leads, logs] =
    await Promise.all([
      admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
      admin.from("leadgen_campaigns").select("id, name, status, client_id").order("name"),
      admin.from("leadgen_clients").select("id, name, active, is_internal_test").order("name"),
      admin.from("leadgen_campaign_agents").select("campaign_id, agent_id"),
      admin.from("call_list_segments").select("id, name, status, industry, territory, leadgen_campaign_id, created_at").eq("crm", "lead_generation").order("name"),
      admin.from("call_list_segment_agents").select("segment_id, agent_id"),
      withCounts ? fetchSegmentIdPages("call_list_leads", "segment_id") : Promise.resolve([]),
      withCounts ? fetchSegmentIdPages("leadgen_call_logs", "call_list_segment_id") : Promise.resolve([]),
    ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id as string, c]));
  const group = (rows: { [k: string]: string }[] | null, key: string, value: string) => {
    const map = new Map<string, string[]>();
    for (const row of rows ?? []) {
      const list = map.get(row[key]) ?? [];
      list.push(row[value]);
      map.set(row[key], list);
    }
    return map;
  };
  const count = (rows: { [k: string]: string | null }[] | null, key: string) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const id = row[key];
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  };
  const agentsByCampaign = group(campaignAgents as never, "campaign_id", "agent_id");
  const agentsBySegment = group(segmentAgents as never, "segment_id", "agent_id");
  const leadsBySegment = count(leads, "segment_id");
  const logsBySegment = count(logs, "call_list_segment_id");

  return {
    agents: (agents ?? []).map((a) => ({ id: a.id as string, name: a.full_name as string })),
    campaigns: (campaigns ?? []).map((c) => {
      const client = clientById.get(c.client_id as string);
      return {
        id: c.id as string,
        name: c.name as string,
        status: c.status as string,
        clientId: c.client_id as string,
        clientName: (client?.name as string) ?? "Unknown client",
        clientActive: client?.active === true,
        isInternalTest: client?.is_internal_test === true,
        agentIds: agentsByCampaign.get(c.id as string) ?? [],
      };
    }),
    segments: (segments ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      status: s.status as CallListSegmentRow["status"],
      industry: (s.industry as string | null) ?? null,
      territory: (s.territory as string | null) ?? null,
      campaignId: (s.leadgen_campaign_id as string | null) ?? null,
      agentIds: agentsBySegment.get(s.id as string) ?? [],
      leadCount: leadsBySegment.get(s.id as string) ?? 0,
      callLogCount: logsBySegment.get(s.id as string) ?? 0,
    })),
  };
}

// A "production" list is one that's been deployed (active/completed); drafts
// are still being cleaned and can't reach an agent at all.
export function isProductionSegment(status: string): boolean {
  return status === "active" || status === "completed";
}

export type AssignmentProblems = {
  unassignedProduction: { id: string; name: string }[];
  onInternalTestClient: { id: string; name: string }[];
  pausedOrInactive: { id: string; name: string }[];
};

export function findAssignmentProblems(overview: AssignmentOverview): AssignmentProblems {
  const campaignById = new Map(overview.campaigns.map((c) => [c.id, c]));
  const problems: AssignmentProblems = { unassignedProduction: [], onInternalTestClient: [], pausedOrInactive: [] };
  for (const segment of overview.segments) {
    if (!isProductionSegment(segment.status)) continue;
    const campaign = segment.campaignId ? campaignById.get(segment.campaignId) : null;
    if (!campaign) problems.unassignedProduction.push({ id: segment.id, name: segment.name });
    else if (campaign.isInternalTest) problems.onInternalTestClient.push({ id: segment.id, name: segment.name });
    else if (campaign.status !== "active" || !campaign.clientActive) problems.pausedOrInactive.push({ id: segment.id, name: segment.name });
  }
  return problems;
}

// Clients (via campaigns) an agent is assigned to - used to keep the
// standalone Call Log's client dropdown to the agent's own clients.
export async function getAgentAssignedClientIds(agentId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data: rows } = await admin.from("leadgen_campaign_agents").select("campaign_id").eq("agent_id", agentId);
  const campaignIds = (rows ?? []).map((r) => r.campaign_id as string);
  if (campaignIds.length === 0) return [];
  const { data: campaigns } = await admin.from("leadgen_campaigns").select("client_id").in("id", campaignIds);
  return [...new Set((campaigns ?? []).map((c) => c.client_id as string))];
}

// Gives an agent access to a campaign - but ONLY if they're already
// campaign-restricted. Any leadgen_campaign_agents row flips an agent into
// RLS-restricted mode (leadgen_agent_campaign_allowed, migration 0077), so
// adding a row for a currently-unrestricted agent would silently take away
// their access to every other client. Unrestricted agents already see all
// campaigns, so nothing needs to be added for them.
export async function ensureRestrictedAgentOnCampaign(campaignId: string, agentId: string, assignedBy: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { count } = await admin.from("leadgen_campaign_agents").select("id", { count: "exact", head: true }).eq("agent_id", agentId);
  if (!count) return;
  await admin
    .from("leadgen_campaign_agents")
    .upsert({ campaign_id: campaignId, agent_id: agentId, assigned_by: assignedBy }, { onConflict: "campaign_id,agent_id", ignoreDuplicates: true });
}
