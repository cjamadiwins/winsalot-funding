import { notFound } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSegment, getSegmentAgentIds, listSyncRuns } from "@/lib/call-list-segments";
import SegmentDetailClient from "@/components/crm-call-list/SegmentDetailClient";
import { syncSegmentNowAction, updateSegmentAgentsAction, disconnectSegmentAction, reactivateSegmentAction } from "../actions";

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Financing",
  both_services: "Lead Gen + Financing",
};

const OPEN_STAGES = ["New Prospect", "Contacted", "Interested", "Consultation Booked", "Proposal or Application Sent", "Follow-Up Required"];

export default async function CallListSegmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ agent?: string; status?: string; from?: string; to?: string }>;
}) {
  await requireCrmAdmin();
  const { id } = await params;
  const filters = await searchParams;

  const segment = await getSegment(id);
  if (!segment || segment.crm !== "growth") notFound();

  const admin = getSupabaseAdmin();

  let leadsQuery = admin.from("crm_opportunities").select("*").eq("call_list_segment_id", id);
  if (filters.agent) leadsQuery = leadsQuery.eq("assigned_agent_id", filters.agent);
  if (filters.status) leadsQuery = leadsQuery.eq("stage", filters.status);
  if (filters.from) leadsQuery = leadsQuery.gte("created_at", filters.from);
  if (filters.to) leadsQuery = leadsQuery.lte("created_at", filters.to);

  const [
    { data: filteredLeads },
    { count: totalLeads },
    { count: openLeads },
    { count: callsMade },
    { count: interestedLeads },
    { count: callbacksDue },
    { count: appointmentsBooked },
    { data: activities },
    agentIds,
    syncRuns,
    agentsResult,
  ] = await Promise.all([
    leadsQuery.order("created_at", { ascending: false }),
    admin.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("call_list_segment_id", id),
    admin
      .from("crm_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("call_list_segment_id", id)
      .eq("archived", false)
      .in("stage", OPEN_STAGES),
    admin.from("crm_activities").select("id", { count: "exact", head: true }).eq("call_list_segment_id", id).eq("activity_type", "call"),
    admin.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("call_list_segment_id", id).eq("stage", "Interested"),
    admin
      .from("crm_followups")
      .select("id", { count: "exact", head: true })
      .eq("call_list_segment_id", id)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString()),
    admin.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("call_list_segment_id", id).not("consultation_date", "is", null),
    admin
      .from("crm_activities")
      .select("*")
      .eq("call_list_segment_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    getSegmentAgentIds(id),
    listSyncRuns(id),
    admin.from("crm_users").select("id, full_name").eq("role", "agent").order("full_name"),
  ]);

  const agents = ((agentsResult.data ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name }));
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <div>
      <SegmentDetailClient
        basePath="/admin/crm/call-list-segments"
        segment={segment}
        serviceLabel={OPPORTUNITY_TYPE_LABELS[segment.growth_opportunity_type ?? ""] ?? "—"}
        statusOptions={["New Prospect", "Contacted", "Interested", "Consultation Booked", "Proposal or Application Sent", "Client Won", "Follow-Up Required", "Not Interested"]}
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
          status: l.stage,
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
