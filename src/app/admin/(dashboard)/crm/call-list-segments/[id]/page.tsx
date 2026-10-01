import { loadCallListProgress, countSegmentCalls } from "@/lib/call-list-progress-data";
import { emptyCallListProgress } from "@/lib/call-list-progress";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSegment, getSegmentAgentIds } from "@/lib/call-list-segments";
import { isAgentService, type AgentService } from "@/lib/crm-agent-service-shared";
import { GROWTH_CRM_CAMPAIGN_KEYS, GROWTH_CRM_CAMPAIGN_LABELS } from "@/lib/growth-crm-campaign-scripts";
import { resolveGrowthScriptKey } from "@/lib/call-list-script-shared";
import { listSegmentLeads, listRemovedSegmentLeads } from "@/lib/call-list-leads";
import { getHiddenColumnFields } from "@/lib/call-list-column-visibility";
import { GROWTH_CALL_LIST_OWNER } from "@/lib/growth-call-list-owner";
import SpreadsheetEditorClient from "@/components/crm-call-list/SpreadsheetEditorClient";
import DeployPanelClient from "@/components/crm-call-list/DeployPanelClient";
import DeleteDraftButton from "@/components/crm-call-list/DeleteDraftButton";
import SegmentPerformanceClient, { type SegmentCallLogView } from "@/components/crm-call-list/SegmentPerformanceClient";
import {
  addSegmentLeadAction,
  backfillSegmentLocationsAction,
  deleteDraftSegmentAction,
  deploySegmentAction,
  saveSegmentAssignmentAction,
  saveSegmentScriptAction,
  previewUploadFileAction,
  promoteSegmentLeadAction,
  recheckDuplicatesAction,
  removeSegmentLeadsAction,
  restoreSegmentLeadsAction,
  updateCallListColumnVisibilityAction,
  updateSegmentLeadAction,
  updateSegmentStatusAction,
} from "../actions";

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Financing",
  both_services: "Lead Gen + Financing",
};

export default async function CallListSegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;

  const segment = await getSegment(id);
  if (!segment || segment.crm !== "growth") notFound();

  const admin = getSupabaseAdmin();
  const serviceLabel = segment.campaign_name || OPPORTUNITY_TYPE_LABELS[segment.growth_opportunity_type ?? ""] || "—";

  if (segment.status === "draft") {
    const [leads, removedLeads, hiddenFields] = await Promise.all([
      listSegmentLeads(segment.id),
      listRemovedSegmentLeads(segment.id),
      getHiddenColumnFields("growth"),
    ]);
    const [{ data: agentsResult }] = await Promise.all([
      admin.from("crm_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
    ]);
    const agents = ((agentsResult ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name }));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/admin/crm/call-list-segments" className="inline-flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-3.5 w-3.5" /> All segments
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{segment.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Draft · {serviceLabel} · Client / Campaign Owner: {GROWTH_CALL_LIST_OWNER} · {leads.length} row(s) from {segment.source_file_name}
            </p>
          </div>
          <DeleteDraftButton segmentId={segment.id} listHref="/admin/crm/call-list-segments" deleteAction={deleteDraftSegmentAction} />
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
          initialHiddenFields={hiddenFields}
          updateColumnVisibilityAction={updateCallListColumnVisibilityAction}
        />

        <DeployPanelClient
          segmentId={segment.id}
          agents={agents}
          clientLabel={GROWTH_CALL_LIST_OWNER}
          campaignLabel={segment.campaign_name ?? segment.name}
          industry={segment.industry}
          location={segment.territory}
          productionLeadCount={leads.length}
          deployAction={deploySegmentAction}
        />
      </div>
    );
  }

  const [leads, removedLeads, hiddenFields, agentIds, agentsResult, callLogsResult] = await Promise.all([
    listSegmentLeads(segment.id),
    listRemovedSegmentLeads(segment.id),
    getHiddenColumnFields("growth"),
    getSegmentAgentIds(segment.id),
    admin.from("crm_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
    admin
      .from("crm_call_logs")
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

  // Admin "Save Assignment": service + agents. Agent eligibility follows each
  // agent's Admin-set Growth service assignment (CRM Agents page).
  const { data: serviceRows } = await admin.from("crm_agent_service_assignments").select("agent_id, service");
  const agentServices: Record<string, AgentService | null> = {};
  for (const agent of agents) agentServices[agent.id] = null;
  for (const row of serviceRows ?? []) if (isAgentService(row.service)) agentServices[row.agent_id as string] = row.service;
  const currentService = segment.growth_opportunity_type ?? "lead_generation";
  const serviceOptions = [
    { value: "lead_generation", label: "Lead Generation" },
    { value: "business_financing", label: "Business Finance" },
    ...(currentService === "both_services" ? [{ value: "both_services", label: "Lead Gen + Financing (existing)" }] : []),
  ];

  const [progressBySegment, callsMade] = await Promise.all([
    loadCallListProgress(admin, [segment.id]),
    countSegmentCalls(admin, "growth", segment.id),
  ]);
  const progress = progressBySegment.get(segment.id) ?? emptyCallListProgress();
  const stats = {
    totalLeads: progress.totalLeads,
    leadsRemaining: progress.unworkedLeads,
    callsMade,
    interested: progress.interested,
    callbacksDue: progress.callbacksDue,
    appointmentsBooked: progress.appointmentsBooked,
    promoted: progress.promoted,
  };

  return (
    <SegmentPerformanceClient
      basePath="/admin/crm/call-list-segments"
      segment={segment}
      serviceLabel={serviceLabel}
      campaignOwnerLabel={GROWTH_CALL_LIST_OWNER}
      leads={leads}
      removedLeads={removedLeads}
      agentNameById={agentNameById}
      allAgents={agents}
      assignedAgentIds={agentIds}
      callLogs={callLogs}
      stats={stats}
      deployAction={deploySegmentAction}
      script={{
        templateOptions: GROWTH_CRM_CAMPAIGN_KEYS.map((k) => ({ value: k, label: GROWTH_CRM_CAMPAIGN_LABELS[k] })),
        initialKey: resolveGrowthScriptKey(segment) ?? "",
        initialText: segment.call_script_text ?? "",
        helpText: "The script assigned agents see in this list's workspace. Pick a template for this service/campaign and/or write a custom script (custom text replaces the template). Changes apply immediately and never affect past calls.",
        saveAction: saveSegmentScriptAction,
      }}
      assignment={{
        scopeLabel: "Service",
        scopeOptions: serviceOptions,
        initialScope: currentService,
        fixedClientLabel: GROWTH_CALL_LIST_OWNER,
        agentServices,
        saveAction: saveSegmentAssignmentAction,
      }}
      updateStatusAction={updateSegmentStatusAction}
      promoteAction={promoteSegmentLeadAction}
      restoreLeadsAction={restoreSegmentLeadsAction}
      initialHiddenFields={hiddenFields}
      updateColumnVisibilityAction={updateCallListColumnVisibilityAction}
      previewLocationsFileAction={previewUploadFileAction}
      backfillLocationsAction={backfillSegmentLocationsAction.bind(null, segment.id)}
    />
  );
}
