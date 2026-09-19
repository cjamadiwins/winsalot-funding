import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSegment, getSegmentAgentIds } from "@/lib/call-list-segments";
import { listSegmentLeads, listRemovedSegmentLeads } from "@/lib/call-list-leads";
import SpreadsheetEditorClient from "@/components/crm-call-list/SpreadsheetEditorClient";
import DeployPanelClient from "@/components/crm-call-list/DeployPanelClient";
import DeleteDraftButton from "@/components/crm-call-list/DeleteDraftButton";
import SegmentPerformanceClient, { type SegmentCallLogView } from "@/components/crm-call-list/SegmentPerformanceClient";
import {
  addSegmentLeadAction,
  deleteDraftSegmentAction,
  deploySegmentAction,
  promoteSegmentLeadAction,
  recheckDuplicatesAction,
  removeSegmentLeadsAction,
  restoreSegmentLeadsAction,
  updateSegmentLeadAction,
  updateSegmentStatusAction,
} from "../actions";

async function resolveServiceLabel(admin: ReturnType<typeof getSupabaseAdmin>, leadgenCampaignId: string | null): Promise<string | null> {
  if (!leadgenCampaignId) return null;
  const { data: campaign } = await admin.from("leadgen_campaigns").select("name, client_id").eq("id", leadgenCampaignId).maybeSingle();
  if (!campaign) return null;
  const { data: client } = await admin.from("leadgen_clients").select("name").eq("id", campaign.client_id).maybeSingle();
  return `${client?.name ?? "Unknown client"} — ${campaign.name}`;
}

export default async function LeadgenCallListSegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;

  const segment = await getSegment(id);
  if (!segment || segment.crm !== "lead_generation") notFound();

  const admin = getSupabaseAdmin();
  const serviceLabel = segment.campaign_name || (await resolveServiceLabel(admin, segment.leadgen_campaign_id)) || "—";

  if (segment.status === "draft") {
    const [leads, removedLeads] = await Promise.all([listSegmentLeads(segment.id), listRemovedSegmentLeads(segment.id)]);
    const { data: agentsResult } = await admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name");
    const agents = ((agentsResult ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name }));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/leadgen/admin/call-list-segments" className="inline-flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-3.5 w-3.5" /> All segments
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{segment.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Draft · {serviceLabel} · {leads.length} row(s) from {segment.source_file_name}
            </p>
          </div>
          <DeleteDraftButton segmentId={segment.id} listHref="/leadgen/admin/call-list-segments" deleteAction={deleteDraftSegmentAction} />
        </div>

        <SpreadsheetEditorClient
          segmentId={segment.id}
          initialLeads={leads}
          initialRemovedLeads={removedLeads}
          updateLeadAction={updateSegmentLeadAction}
          addLeadAction={addSegmentLeadAction}
          removeLeadsAction={removeSegmentLeadsAction}
          restoreLeadsAction={restoreSegmentLeadsAction}
          recheckDuplicatesAction={recheckDuplicatesAction}
        />

        <DeployPanelClient segmentId={segment.id} agents={agents} deployAction={deploySegmentAction} />
      </div>
    );
  }

  const [leads, removedLeads, agentIds, agentsResult, callLogsResult] = await Promise.all([
    listSegmentLeads(segment.id),
    listRemovedSegmentLeads(segment.id),
    getSegmentAgentIds(segment.id),
    admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
    admin
      .from("leadgen_call_logs")
      .select("id, created_at, agent_id, business_name, contact_name, outcome, notes, callback_at, appointment_at")
      .eq("call_list_segment_id", segment.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const agents = ((agentsResult.data ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name }));
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  const callLogs: SegmentCallLogView[] = ((callLogsResult.data ?? []) as {
    id: string;
    created_at: string;
    agent_id: string;
    business_name: string;
    contact_name: string | null;
    outcome: string;
    notes: string;
    callback_at: string | null;
    appointment_at: string | null;
  }[]).map((log) => ({
    ...log,
    agent_name: agentNameById.get(log.agent_id) ?? "Unknown agent",
  }));

  const nowIso = new Date().toISOString();
  const stats = {
    totalLeads: leads.length,
    leadsRemaining: leads.filter((l) => !l.last_outcome).length,
    callsMade: callLogs.length,
    interested: leads.filter((l) => l.last_outcome === "Interested").length,
    callbacksDue: leads.filter((l) => l.callback_at && l.callback_at <= nowIso).length,
    appointmentsBooked: leads.filter((l) => l.last_outcome === "Appointment Booked").length,
    promoted: leads.filter((l) => l.promoted_leadgen_lead_id).length,
  };

  return (
    <SegmentPerformanceClient
      basePath="/leadgen/admin/call-list-segments"
      segment={segment}
      serviceLabel={serviceLabel}
      leads={leads}
      removedLeads={removedLeads}
      agentNameById={agentNameById}
      allAgents={agents}
      assignedAgentIds={agentIds}
      callLogs={callLogs}
      stats={stats}
      deployAction={deploySegmentAction}
      updateStatusAction={updateSegmentStatusAction}
      promoteAction={promoteSegmentLeadAction}
      restoreLeadsAction={restoreSegmentLeadsAction}
    />
  );
}
