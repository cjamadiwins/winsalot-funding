import { loadCallListProgress, countSegmentCalls } from "@/lib/call-list-progress-data";
import { emptyCallListProgress } from "@/lib/call-list-progress";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSegment, getSegmentAgentIds } from "@/lib/call-list-segments";
import { listSegmentLeads, listRemovedSegmentLeads } from "@/lib/call-list-leads";
import { getHiddenColumnFields } from "@/lib/call-list-column-visibility";
import SpreadsheetEditorClient from "@/components/crm-call-list/SpreadsheetEditorClient";
import DeployPanelClient from "@/components/crm-call-list/DeployPanelClient";
import DeleteDraftButton from "@/components/crm-call-list/DeleteDraftButton";
import SegmentPerformanceClient, { type SegmentCallLogView } from "@/components/crm-call-list/SegmentPerformanceClient";
import OttawaPainterTransferClient from "@/components/crm-call-list/OttawaPainterTransferClient";
import { loadCampaignDetails } from "@/lib/leadgen-campaign-admin";
import { resolveScriptOverride } from "@/lib/leadgen-campaign-form";
import type { CallScriptClientOption } from "@/components/leadgen/ClientCallScriptSelector";
import {
  addSegmentLeadAction,
  backfillSegmentLocationsAction,
  deleteDraftSegmentAction,
  deploySegmentAction,
  saveSegmentAssignmentAction,
  saveSegmentScriptAction,
  createCampaignFromListAction,
  updateCampaignFromListAction,
  previewUploadFileAction,
  promoteSegmentLeadAction,
  recheckDuplicatesAction,
  removeSegmentLeadsAction,
  restoreSegmentLeadsAction,
  updateCallListColumnVisibilityAction,
  updateSegmentLeadAction,
  updateSegmentStatusAction,
  transferOttawaPainterLeadAction,
} from "../actions";

async function resolveServiceLabel(admin: ReturnType<typeof getSupabaseAdmin>, leadgenCampaignId: string | null): Promise<string | null> {
  if (!leadgenCampaignId) return null;
  const { data: campaign } = await admin.from("leadgen_campaigns").select("name, client_id").eq("id", leadgenCampaignId).maybeSingle();
  if (!campaign) return null;
  const { data: client } = await admin.from("leadgen_clients").select("name").eq("id", campaign.client_id).maybeSingle();
  return `${client?.name ?? "Unknown client"} — ${campaign.name}`;
}

// Client Call Script (brief "Call List") - resolves the one client this
// whole segment is deployed against (a segment is always tied to a single
// leadgen_campaign_id), for the compact script panel shown alongside the
// segment's performance stats below.
async function resolveCallScriptClient(admin: ReturnType<typeof getSupabaseAdmin>, leadgenCampaignId: string | null): Promise<CallScriptClientOption | null> {
  if (!leadgenCampaignId) return null;
  const { data: campaign } = await admin.from("leadgen_campaigns").select("client_id, call_script_text").eq("id", leadgenCampaignId).maybeSingle();
  if (!campaign) return null;
  const { data: client } = await admin
    .from("leadgen_clients")
    .select("id, name, call_script_value_proposition, call_script_services, call_script_closing, call_script_notes, call_script_override")
    .eq("id", campaign.client_id)
    .maybeSingle();
  if (!client) return null;
  // A campaign-level custom script (blank = none) takes precedence over the client's.
  return { ...(client as CallScriptClientOption), call_script_override: resolveScriptOverride({ campaignText: campaign.call_script_text, clientOverride: client.call_script_override }) };
}

export default async function LeadgenCallListSegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requireLeadgenAdmin();
  const { id } = await params;

  const segment = await getSegment(id);
  if (!segment || segment.crm !== "lead_generation") notFound();

  const admin = getSupabaseAdmin();
  const serviceLabel = segment.campaign_name || (await resolveServiceLabel(admin, segment.leadgen_campaign_id)) || "—";

  if (segment.status === "draft") {
    const [leads, removedLeads, hiddenFields] = await Promise.all([
      listSegmentLeads(segment.id),
      listRemovedSegmentLeads(segment.id),
      getHiddenColumnFields("lead_generation"),
    ]);
    const [{ data: agentsResult }, { data: campaign }] = await Promise.all([
      admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
      segment.leadgen_campaign_id
        ? admin.from("leadgen_campaigns").select("name, client_id").eq("id", segment.leadgen_campaign_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const agents = ((agentsResult ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name }));
    const { data: client } = campaign ? await admin.from("leadgen_clients").select("name").eq("id", campaign.client_id).maybeSingle() : { data: null };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/leadgen/admin/call-list-segments" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
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
          initialHiddenFields={hiddenFields}
          updateColumnVisibilityAction={updateCallListColumnVisibilityAction}
        />

        <DeployPanelClient
          segmentId={segment.id}
          agents={agents}
          clientLabel={client?.name ?? undefined}
          campaignLabel={[segment.industry, segment.territory].filter(Boolean).join(" — ") || campaign?.name || segment.campaign_name || undefined}
          industry={undefined}
          productionLeadCount={leads.length}
          deployAction={deploySegmentAction}
        />
      </div>
    );
  }

  const [leads, removedLeads, hiddenFields, agentIds, agentsResult, callLogsResult, callScriptClient] = await Promise.all([
    listSegmentLeads(segment.id),
    listRemovedSegmentLeads(segment.id),
    getHiddenColumnFields("lead_generation"),
    getSegmentAgentIds(segment.id),
    admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
    admin
      .from("leadgen_call_logs")
      .select("id, created_at, agent_id, business_name, contact_name, outcome, notes, callback_at, appointment_at")
      .eq("call_list_segment_id", segment.id)
      .order("created_at", { ascending: false })
      .limit(200),
    resolveCallScriptClient(admin, segment.leadgen_campaign_id),
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

  const [progressBySegment, callsMade] = await Promise.all([
    loadCallListProgress(admin, [segment.id]),
    countSegmentCalls(admin, "lead_generation", segment.id),
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

  // Admin "Save Assignment": client (campaign) + agents.
  const [{ data: assignCampaigns }, { data: assignClients }] = await Promise.all([
    admin.from("leadgen_campaigns").select("id, name, client_id, status").order("name"),
    admin.from("leadgen_clients").select("id, name, active, is_internal_test").order("name"),
  ]);
  const assignClientById = new Map((assignClients ?? []).map((c) => [c.id as string, c]));
  const currentCampaign = (assignCampaigns ?? []).find((campaign) => campaign.id === segment.leadgen_campaign_id);
  const currentClientId = currentCampaign?.client_id as string | undefined;
  const clientOptions = (assignClients ?? [])
    .filter((client) => (client.active || client.id === currentClientId) && !client.is_internal_test)
    .map((client) => ({ value: client.id as string, label: `${client.name}${client.active ? "" : " (inactive)"}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const campaignsByClient: Record<string, { value: string; label: string }[]> = {};
  for (const campaign of assignCampaigns ?? []) {
    const client = assignClientById.get(campaign.client_id as string);
    if (!client || (!client.active && client.id !== currentClientId) || client.is_internal_test) continue;
    if (campaign.status !== "active" && campaign.id !== segment.leadgen_campaign_id) continue;
    (campaignsByClient[campaign.client_id as string] ??= []).push({ value: campaign.id as string, label: campaign.name as string });
  }

  const campaignDetailList = await loadCampaignDetails(admin, Object.values(campaignsByClient).flat().map((option) => option.value));
  const campaignDetails = Object.fromEntries(campaignDetailList.map((detail) => [detail.id, detail]));

  let transferTarget: { id: string; name: string; status: string; clientName: string } | null = null;
  if (segment.source_file_name?.startsWith("campaign-125288-search-924570-painters_ottawa-on-canada")) {
    const { data: currentCampaign } = await admin.from("leadgen_campaigns").select("client_id").eq("id", segment.leadgen_campaign_id).maybeSingle();
    const { data: currentClient } = currentCampaign
      ? await admin.from("leadgen_clients").select("name").eq("id", currentCampaign.client_id).maybeSingle()
      : { data: null };
    const targetClientName = currentClient?.name === "Hidebrandt Web Services" ? "Web6 Solutions"
      : currentClient?.name === "Web6 Solutions" ? "Hidebrandt Web Services" : null;
    if (targetClientName) {
      const { data: client } = await admin.from("leadgen_clients").select("id").eq("name", targetClientName).eq("active", true).maybeSingle();
      const campaignName = targetClientName === "Web6 Solutions"
        ? "Web6 Solutions – Website Design Lead Generation"
        : "Hidebrandt Web Services – Website Services Lead Generation";
      const { data: campaign } = client
        ? await admin.from("leadgen_campaigns").select("id, name, status").eq("client_id", client.id).eq("name", campaignName).maybeSingle()
        : { data: null };
      if (campaign) transferTarget = { ...campaign, clientName: targetClientName };
    }
  }

  return (
    <div className="space-y-6">
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
      script={{
        initialKey: "",
        initialText: segment.call_script_text ?? "",
        helpText: "Leave blank to use this client's call script (edit it on the client's page). Write a custom script to use for this list only. Assigned agents see it in this list's workspace immediately; past calls are never affected.",
        saveAction: saveSegmentScriptAction,
      }}
      assignment={{
        scopeLabel: "Campaign / List",
        scopeOptions: [],
        initialScope: segment.leadgen_campaign_id ?? "",
        clientOptions,
        initialClientId: currentCampaign?.client_id as string | undefined,
        campaignsByClient,
        clientProfileHrefPrefix: "/leadgen/admin/clients",
        saveAction: saveSegmentAssignmentAction,
        campaignManager: {
          details: campaignDetails,
          createAction: createCampaignFromListAction.bind(null, segment.id),
          updateAction: updateCampaignFromListAction.bind(null, segment.id),
        },
        helpText: "Choose the production client first, then choose its existing campaign and the agents who work this call list. Selected agents are added to that client's access scope. The segment and its leads stay intact when ownership changes; saved call and appointment history remains under the client recorded at the time.",
      }}
      updateStatusAction={updateSegmentStatusAction}
      promoteAction={promoteSegmentLeadAction}
      restoreLeadsAction={restoreSegmentLeadsAction}
      initialHiddenFields={hiddenFields}
      updateColumnVisibilityAction={updateCallListColumnVisibilityAction}
      previewLocationsFileAction={previewUploadFileAction}
      backfillLocationsAction={backfillSegmentLocationsAction.bind(null, segment.id)}
      callScriptClient={callScriptClient}
      adminName={adminUser.full_name || adminUser.email}
    />
    {transferTarget && segment.status === "active" && (
      <OttawaPainterTransferClient
        sourceSegmentId={segment.id}
        leads={leads.filter((lead) => !lead.removed_at && !lead.promoted_leadgen_lead_id
          && ["no_website", "website_review"].includes(String(lead.extra_fields?.website_category)))
          .map((lead) => ({ id: lead.id, business_name: lead.business_name, phone: lead.phone }))}
        targetCampaign={transferTarget}
        transferAction={transferOttawaPainterLeadAction}
      />
    )}
    </div>
  );
}
