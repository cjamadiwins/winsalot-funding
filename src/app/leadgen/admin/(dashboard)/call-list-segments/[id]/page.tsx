import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSegment, getSegmentAgentIds, listSyncRuns } from "@/lib/call-list-segments";
import { LEADGEN_LEAD_STATUSES, LEADGEN_LEAD_CLOSED_STATUSES } from "@/lib/leadgen-types";
import SegmentDetailClient from "@/components/crm-call-list/SegmentDetailClient";
import { syncSegmentNowAction, updateSegmentAgentsAction, disconnectSegmentAction, reactivateSegmentAction } from "../actions";

// Every status except the ones LEADGEN_LEAD_CLOSED_STATUSES marks as done
// being actively worked - i.e. "Leads Remaining" per the brief's status
// list. Enumerated as an explicit `.in(...)` set (rather than a
// `.not(..., "in", ...)` filter) so PostgREST value quoting/escaping for
// statuses containing spaces is handled the same well-tested way
// Supabase's own `.in()` helper already handles it everywhere else in
// this codebase.
const OPEN_LEAD_STATUSES = LEADGEN_LEAD_STATUSES.filter((status) => !LEADGEN_LEAD_CLOSED_STATUSES.includes(status));

export default async function CallListSegmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ agent?: string; status?: string; from?: string; to?: string }>;
}) {
  await requireLeadgenAdmin();
  const { id } = await params;
  const filters = await searchParams;

  const segment = await getSegment(id);
  if (!segment || segment.crm !== "lead_generation") notFound();

  const admin = getSupabaseAdmin();

  let leadsQuery = admin.from("leadgen_leads").select("*").eq("call_list_segment_id", id);
  if (filters.agent) leadsQuery = leadsQuery.eq("assigned_agent_id", filters.agent);
  if (filters.status) leadsQuery = leadsQuery.eq("status", filters.status);
  if (filters.from) leadsQuery = leadsQuery.gte("created_at", filters.from);
  if (filters.to) leadsQuery = leadsQuery.lte("created_at", filters.to);

  const [
    { data: filteredLeads },
    { count: totalLeads },
    { count: openLeads },
    { count: callsMade },
    { count: interestedLeads },
    { count: callbacksDue },
    { data: segmentLeadIdRows },
    { data: activities },
    agentIds,
    syncRuns,
    agentsResult,
    campaignResult,
  ] = await Promise.all([
    leadsQuery.order("created_at", { ascending: false }),
    admin.from("leadgen_leads").select("id", { count: "exact", head: true }).eq("call_list_segment_id", id),
    admin
      .from("leadgen_leads")
      .select("id", { count: "exact", head: true })
      .eq("call_list_segment_id", id)
      .eq("archived", false)
      .in("status", OPEN_LEAD_STATUSES),
    admin.from("leadgen_lead_activities").select("id", { count: "exact", head: true }).eq("call_list_segment_id", id).eq("activity_type", "call"),
    admin.from("leadgen_leads").select("id", { count: "exact", head: true }).eq("call_list_segment_id", id).eq("status", "Interested"),
    admin
      .from("leadgen_followups")
      .select("id", { count: "exact", head: true })
      .eq("call_list_segment_id", id)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString()),
    admin.from("leadgen_leads").select("id").eq("call_list_segment_id", id),
    admin
      .from("leadgen_lead_activities")
      .select("*")
      .eq("call_list_segment_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    getSegmentAgentIds(id),
    listSyncRuns(id),
    admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
    segment.leadgen_campaign_id
      ? admin.from("leadgen_campaigns").select("id, name, client_id").eq("id", segment.leadgen_campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const segmentLeadIds = (segmentLeadIdRows ?? []).map((l) => l.id as string);
  const { count: appointmentsBooked } = segmentLeadIds.length
    ? await admin.from("leadgen_appointments").select("id", { count: "exact", head: true }).in("lead_id", segmentLeadIds)
    : { count: 0 };

  const campaign = campaignResult.data as { id: string; name: string; client_id: string } | null;
  let serviceLabel = "—";
  if (campaign) {
    const { data: client } = await admin.from("leadgen_clients").select("name").eq("id", campaign.client_id).maybeSingle();
    serviceLabel = `${(client as { name: string } | null)?.name ?? "Unknown Client"} — ${campaign.name}`;
  }

  const agents = ((agentsResult.data ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name }));
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <div>
      <SegmentDetailClient
        basePath="/leadgen/admin/call-list-segments"
        segment={segment}
        serviceLabel={serviceLabel}
        statusOptions={[...LEADGEN_LEAD_STATUSES]}
        stats={{
          totalLeads: totalLeads ?? 0,
          leadsRemaining: openLeads ?? 0,
          callsMade: callsMade ?? 0,
          interestedLeads: interestedLeads ?? 0,
          callbacksDue: callbacksDue ?? 0,
          appointmentsBooked: appointmentsBooked ?? 0,
        }}
        leads={(filteredLeads ?? []).map((l) => ({
          id: l.id,
          businessName: l.business_name,
          contactName: l.contact_name,
          phone: l.phone,
          status: l.status,
          assignedAgentName: l.assigned_agent_id ? agentNameById.get(l.assigned_agent_id) ?? "Unknown" : "Unassigned",
          archived: l.archived,
          createdAt: l.created_at,
        }))}
        activities={(activities ?? []).map((a) => ({
          id: a.id,
          type: a.activity_type,
          notes: a.notes,
          occurredAt: a.occurred_at,
        }))}
        allAgents={agents}
        assignedAgentIds={agentIds}
        syncRuns={syncRuns}
        filters={{ agent: filters.agent ?? "", status: filters.status ?? "", from: filters.from ?? "", to: filters.to ?? "" }}
        syncNowAction={syncSegmentNowAction}
        updateAgentsAction={updateSegmentAgentsAction}
        disconnectAction={disconnectSegmentAction}
        reactivateAction={reactivateSegmentAction}
      />
    </div>
  );
}
