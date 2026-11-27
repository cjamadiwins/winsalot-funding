import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./fetch-all-rows";
import { isLeadgenAppointmentCountable, type LeadgenAppointmentStatus } from "./leadgen-types";
import { websiteOpportunity } from "./leadgen-website-opportunity";

export type WorkspaceCampaign = {
  id: string;
  name: string;
  client_id: string;
  clientName: string;
};
export async function workspaceCampaigns(
  db: SupabaseClient,
  agentId?: string,
): Promise<WorkspaceCampaign[]> {
  const [{ data: campaigns, error }, { data: clients, error: clientError }] =
    await Promise.all([
      db
        .from("leadgen_campaigns")
        .select("id, name, client_id")
        .eq("status", "active")
        .order("name"),
      db
        .from("leadgen_clients")
        .select("id, name")
        .eq("active", true)
        .eq("is_internal_test", false),
    ]);
  if (error || clientError)
    throw new Error("Unable to load campaign accounts.");
  let allowed: Set<string> | null = null;
  if (agentId) {
    const { data, error: assignmentError } = await db
      .from("leadgen_campaign_agents")
      .select("campaign_id")
      .eq("agent_id", agentId);
    if (assignmentError) throw new Error("Unable to verify campaign access.");
    allowed = new Set((data ?? []).map((a) => a.campaign_id));
  }
  const names = new Map((clients ?? []).map((c) => [c.id, c.name]));
  return (campaigns ?? [])
    .filter((c) => names.has(c.client_id) && (!allowed || allowed.has(c.id)))
    .map((c) => ({ ...c, clientName: names.get(c.client_id)! }));
}

const LIST_CONCURRENCY = 4;
type Page<Row> = { data: Row[]; error: { message: string } | null };
async function fetchPerList<Row>(
  ids: string[],
  load: (id: string) => Promise<Page<Row>>,
): Promise<Page<Row>> {
  const out: Row[] = [];
  let next = 0;
  let failure: { message: string } | null = null;
  await Promise.all(
    Array.from({ length: Math.min(LIST_CONCURRENCY, ids.length) }, async () => {
      while (!failure && next < ids.length) {
        const result = await load(ids[next++]);
        if (result.error) failure = result.error;
        else out.push(...result.data);
      }
    }),
  );
  return { data: out, error: failure };
}

// Always session-scoped: explicit campaign filters narrow existing RLS; never bypass it.
export async function loadCampaignWorkspace(
  db: SupabaseClient,
  campaigns: WorkspaceCampaign[],
  selectedId: string | undefined,
  agentId?: string,
) {
  const selected = selectedId
    ? campaigns.find((c) => c.id === selectedId)
    : null;
  if (selectedId && !selected)
    throw new Error("Campaign unavailable or not assigned to you.");
  const campaignIds = selected ? [selected.id] : campaigns.map((c) => c.id);
  const page = <T>(result: {
    data: T[];
    error: { message: string } | null;
  }): T[] => {
    if (result.error)
      throw new Error(
        `Unable to load campaign activity: ${result.error.message}`,
      );
    return result.data;
  };
  if (!campaignIds.length)
    return {
      selected,
      leads: [],
      lists: [],
      calls: [],
      appointments: [],
      followups: [],
      stats: {
        total: 0,
        rebranding: 0,
        new_website: 0,
        verification_needed: 0,
        calls: 0,
        reached: 0,
        appointments: 0,
        followups: 0,
        interested: 0,
      },
    };
  const lists = page(
    await fetchAllRows((from, to) =>
      db
        .from("call_list_segments")
        .select("id, name, leadgen_campaign_id")
        .eq("crm", "lead_generation")
        .in("status", ["active", "completed"])
        .in("leadgen_campaign_id", campaignIds)
        .order("id")
        .range(from, to),
    ),
  );
  const ids = lists.map((s) => s.id);
  const [rawLeads, rawPipeline, rawCalls, rawAppointments] = await Promise.all([
    // One small query per call list, a few at a time. A single query over every
    // list sorted and paged all rows through row-level security and timed out
    // (8s) once the lists grew, which left the page loading forever.
    fetchPerList(ids, (segmentId) =>
      fetchAllRows((from, to) =>
        db
          .from("call_list_leads")
          .select(
            "id, business_name, website, website_verification:extra_fields->>website_verification, last_outcome, callback_at, promoted_leadgen_lead_id, segment_id",
          )
          .eq("segment_id", segmentId)
          .is("removed_at", null)
          .order("id")
          .range(from, to),
      ),
    ),
    fetchAllRows((from, to) => {
      let q = db
        .from("leadgen_leads")
        .select(
          "id, business_name, website, status, next_follow_up_at, campaign_id",
        )
        .in("campaign_id", campaignIds);
      if (agentId) q = q.eq("assigned_agent_id", agentId);
      return q.order("id").range(from, to);
    }),
    fetchAllRows((from, to) => {
      let q = db
        .from("leadgen_call_logs")
        .select(
          "id, created_at, agent_id, business_name, phone, outcome, notes, client_visible_note, client_id, campaign_id",
        )
        .in("campaign_id", campaignIds);
      if (agentId) q = q.eq("agent_id", agentId);
      return q
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to);
    }),
    fetchAllRows((from, to) => {
      let q = db
        .from("leadgen_appointments")
        .select(
          "id, business_name, contact_name, phone, email, appointment_date, appointment_time, appointment_notes, status, campaign_id, booking_agent_id, assigned_specialist_id",
        )
        .in("campaign_id", campaignIds);
      if (agentId)
        q = q.or(
          `booking_agent_id.eq.${agentId},assigned_specialist_id.eq.${agentId}`,
        );
      return q
        .order("appointment_date", { ascending: false })
        .order("id")
        .range(from, to);
    }),
  ]);
  const staging = page(rawLeads);
  const pipeline = page(rawPipeline);
  const calls = page(rawCalls);
  const appointments = page(rawAppointments);
  const promoted = new Set(
    staging.map((l) => l.promoted_leadgen_lead_id).filter(Boolean),
  );
  const leads = [
    ...staging.map((l) => ({
      id: l.id,
      name: l.business_name as string,
      opportunity: websiteOpportunity(
        l.website,
        l.website_verification,
      ),
      status: l.last_outcome as string | null,
      callbackAt: l.callback_at as string | null,
      leadId: l.promoted_leadgen_lead_id as string | null,
      segmentId: l.segment_id as string | null,
    })),
    ...pipeline
      .filter((l) => !promoted.has(l.id))
      .map((l) => ({
        id: l.id,
        name: l.business_name as string,
        opportunity: websiteOpportunity(l.website),
        status: l.status as string | null,
        callbackAt: l.next_follow_up_at as string | null,
        leadId: l.id as string | null,
        segmentId: null as string | null,
      })),
  ];
  // Promoted prospects use the pipeline's authoritative follow-up/status.
  const byId = new Map(pipeline.map((l) => [l.id, l]));
  for (const l of leads) {
    const p = l.leadId ? byId.get(l.leadId) : null;
    if (p) {
      l.status = p.status;
      l.callbackAt = p.next_follow_up_at;
    }
  }
  const followups = leads.filter(
    (l) => l.callbackAt && Date.parse(l.callbackAt) <= Date.now(),
  );
  const stats = {
    total: leads.length,
    rebranding: leads.filter((l) => l.opportunity === "rebranding").length,
    new_website: leads.filter((l) => l.opportunity === "new_website").length,
    verification_needed: leads.filter(
      (l) => l.opportunity === "verification_needed",
    ).length,
    calls: calls.length,
    reached: new Set(
      calls
        .filter((c) =>
          [
            "Gatekeeper",
            "Not Interested",
            "Callback",
            "Do Not Call",
            "Interested",
            "Appointment Booked",
          ].includes(c.outcome),
        )
        .map(
          (c) =>
            c.phone?.replace(/\D/g, "").slice(-10) || c.business_name || c.id,
        ),
    ).size,
    appointments: appointments.filter(
      (a) => isLeadgenAppointmentCountable(a.status as LeadgenAppointmentStatus),
    ).length,
    followups: followups.length,
    interested: leads.filter((l) => l.status?.toLowerCase() === "interested")
      .length,
  };
  return { selected, leads, lists, calls, appointments, followups, stats };
}
