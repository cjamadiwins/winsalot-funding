"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil, Plus, Save } from "lucide-react";
import CampaignFormModal from "./CampaignFormModal";
import type { CampaignDetail, CampaignFormInput } from "@/lib/leadgen-campaign-form";
import { AGENT_SERVICE_LABELS, isAgentService, serviceAllowsOpportunityType, type AgentService } from "@/lib/crm-agent-service-shared";

type Option = { value: string; label: string };
type Agent = { id: string; name: string };

// Admin-only "Save Assignment" for an existing call list, shared by both CRMs:
//   Growth CRM:          Winsalot Corp [fixed] + Service + Assigned Agents
//   Lead Generation CRM: Client [client / campaign] + Assigned Agents
// Saving replaces the list's agent roster with whoever is ticked (agents who
// stay are untouched); unticking an agent removes only their access to this
// list - calls, notes, leads and history stay. The server re-validates
// everything (Admin gate, eligibility) and RLS enforces the result, so this UI
// is only a convenience.
export default function SegmentAssignmentPanelClient({
  segmentId,
  scopeLabel,
  scopeOptions,
  initialScope,
  clientOptions,
  initialClientId,
  campaignsByClient,
  clientProfileHrefPrefix,
  fixedClientLabel,
  industry,
  location,
  productionLeadCount,
  listName,
  agents,
  assignedAgentIds,
  agentServices,
  agentScopes,
  saveAction,
  helpText,
  campaignManager,
}: {
  segmentId: string;
  scopeLabel: string;
  scopeOptions: Option[];
  initialScope: string;
  clientOptions?: Option[];
  initialClientId?: string;
  campaignsByClient?: Record<string, Option[]>;
  clientProfileHrefPrefix?: string;
  fixedClientLabel?: string;
  industry?: string | null;
  location?: string | null;
  productionLeadCount?: number;
  listName?: string;
  agents: Agent[];
  assignedAgentIds: string[];
  // Growth only: each agent's Admin-set service. When provided, agents who
  // can't take the chosen service are greyed out (the server enforces it too).
  agentServices?: Record<string, AgentService | null>;
  // Lead Gen only: currently unused by the client-first flow. Kept optional
  // for compatible callers that still choose to restrict agents by campaign.
  agentScopes?: Record<string, string[]>;
  saveAction: (segmentId: string, scope: string, agentIds: string[], clientId: string | undefined) => Promise<{ error?: string; added?: number; removed?: number }>;
  helpText?: string;
  // Lead Generation only (Admin): create/edit a campaign without leaving this page.
  // Both actions are Admin-gated server actions bound to this segment.
  campaignManager?: {
    details: Record<string, CampaignDetail>;
    createAction: (clientId: string, input: CampaignFormInput) => Promise<{ error?: string; campaign?: CampaignDetail }>;
    updateAction: (campaignId: string, input: CampaignFormInput) => Promise<{ error?: string; campaign?: CampaignDetail }>;
  };
}) {
  const router = useRouter();
  const [scope, setScope] = useState(initialScope);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [selected, setSelected] = useState<string[]>(assignedAgentIds);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [campaignDetails, setCampaignDetails] = useState<Record<string, CampaignDetail>>(campaignManager?.details ?? {});
  const [campaignModal, setCampaignModal] = useState<"create" | "edit" | null>(null);

  const eligible = (agentId: string, forScope: string) =>
    agentScopes ? (agentScopes[agentId] ?? []).includes(forScope) : !agentServices || serviceAllowsOpportunityType(agentServices[agentId] ?? null, forScope);
  const restrictsByScope = !!agentServices || !!agentScopes;
  // Campaigns created or edited on this page show up (and stay selected) at once,
  // before the server list refreshes; a non-active one is labelled as such.
  const campaignLabel = (id: string, fallback: string) => {
    const detail = campaignDetails[id];
    if (!detail) return fallback;
    return `${detail.name}${detail.status === "active" ? "" : ` (${detail.status === "paused" ? "Paused" : "Completed"})`}`;
  };
  const availableScopes = campaignsByClient
    ? (() => {
        const base = (campaignsByClient[clientId] ?? []).map((option) => ({ value: option.value, label: campaignLabel(option.value, option.label) }));
        const added = Object.values(campaignDetails)
          .filter((detail) => detail.clientId === clientId && !base.some((option) => option.value === detail.id))
          .map((detail) => ({ value: detail.id, label: campaignLabel(detail.id, detail.name) }));
        return [...base, ...added];
      })()
    : scopeOptions;
  const selectedCampaign = campaignManager && scope ? campaignDetails[scope] : undefined;
  const selectedCampaignInactive = !!selectedCampaign && selectedCampaign.status !== "active" && scope !== initialScope;
  const assignmentSummary = (clientOptions || fixedClientLabel) && (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-700">
      <div className="font-semibold text-slate-900">Assignment summary</div>
      <div className="mt-1">Client: {fixedClientLabel ?? (clientId && clientProfileHrefPrefix
        ? <Link href={`${clientProfileHrefPrefix}/${clientId}`} className="font-medium text-sky-700 hover:underline">{clientOptions?.find((option) => option.value === clientId)?.label}</Link>
        : clientOptions?.find((option) => option.value === clientId)?.label ?? "Select a client")}</div>
      {listName && <div>Call List: {listName}</div>}
      <div>Campaign: {[fixedClientLabel ?? clientOptions?.find((option) => option.value === clientId)?.label, industry || listName, location].filter(Boolean).join(" — ") || "—"}</div>
      <div>Assigned Agent(s): {agents.filter((agent) => selected.includes(agent.id)).map((agent) => agent.name).join(", ") || "Select at least one agent"}</div>
      {productionLeadCount !== undefined && <div>Production Leads: {productionLeadCount}</div>}
    </div>
  );

  function changeClient(next: string) {
    setClientId(next);
    if (campaignsByClient) {
      const nextCampaigns = campaignsByClient[next] ?? [];
      const nextScope = nextCampaigns.some((option) => option.value === scope) ? scope : "";
      setScope(nextScope);
      const dropped = selected.filter((id) => !eligible(id, nextScope));
      if (dropped.length > 0) {
        setSelected((prev) => prev.filter((id) => eligible(id, nextScope)));
        setNotice(`${dropped.length} agent(s) aren't assigned to this client's campaign and were unselected.`);
      } else setNotice(null);
    }
  }

  function changeScope(next: string) {
    setScope(next);
    if (restrictsByScope) {
      const dropped = selected.filter((id) => !eligible(id, next));
      if (dropped.length > 0) {
        setSelected((prev) => prev.filter((id) => eligible(id, next)));
        setNotice(`${dropped.length} agent(s) aren't assigned to this ${agentScopes ? "client" : "service"} and were unselected.`);
        return;
      }
    }
    setNotice(null);
  }

  function handleCampaignSaved(campaign: CampaignDetail, created: boolean) {
    setCampaignDetails((prev) => ({ ...prev, [campaign.id]: campaign }));
    setCampaignModal(null);
    setError(null);
    if (created) {
      // Keep the chosen client, select the new campaign, and carry its agents over
      // to the list's selection (nothing is saved to the list until Save Assignment).
      setScope(campaign.id);
      setSelected((prev) => [...new Set([...prev, ...campaign.agentIds])]);
      setNotice(`Campaign "${campaign.name}" created and selected. Choose the agents and click Save Assignment to assign this list to it.`);
    } else {
      setNotice(`Campaign "${campaign.name}" updated. Leads, calls and history are unchanged.`);
    }
    router.refresh();
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveAction(segmentId, scope, selected, clientId || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(`Saved. ${result.added ?? 0} agent(s) added, ${result.removed ?? 0} removed.${fixedClientLabel ? ` Campaign Owner: ${fixedClientLabel}.` : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Call List Assignment</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">
        {helpText ??
          "Choose the list's assignment and tick the agents who work it. Saving replaces the assigned agents with whoever is ticked; unticking an agent removes only their access to this list - calls, notes, leads and history stay."}
      </p>
      {error && <p className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
      {notice && !error && <p className="mt-2 text-[12.5px] text-emerald-700">{notice}</p>}

      {clientOptions && !fixedClientLabel && (
        <label className="mt-3 block text-[12.5px] font-semibold text-slate-700">
          Client
          <select
            value={clientId}
            onChange={(e) => changeClient(e.target.value)}
            disabled={isPending}
            className="mt-1 block w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 disabled:opacity-60"
          >
            <option value="">Select a production client…</option>
            {clientOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      )}

      {!campaignsByClient && assignmentSummary}

      <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="block min-w-[14rem] flex-1 text-[12.5px] font-semibold text-slate-700">
        {scopeLabel}
        <select
          value={scope}
          onChange={(e) => changeScope(e.target.value)}
          disabled={isPending || (!!campaignsByClient && !clientId)}
          className="mt-1 block w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 disabled:opacity-60"
        >
          {!availableScopes.some((o) => o.value === scope) && <option value={scope}>{scope || (campaignsByClient ? "Select a campaign…" : "Not set")}</option>}
          {availableScopes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {campaignManager && (
        <div className="flex items-center gap-2 pb-0.5">
          <button
            type="button"
            disabled={isPending || !clientId}
            onClick={() => setCampaignModal("create")}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-[12.5px] font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> New Campaign
          </button>
          {selectedCampaign && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setCampaignModal("edit")}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-[12.5px] font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit Campaign
            </button>
          )}
        </div>
      )}
      </div>
      {selectedCampaignInactive && <p className="mt-1 text-[12px] text-amber-700">This campaign is {selectedCampaign?.status}. Set it to Active (Edit Campaign) before assigning this list to it.</p>}

      {campaignsByClient && assignmentSummary}

      <div className="mt-3 text-[12.5px] font-semibold text-slate-700">Assigned Agents</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {agents.length === 0 && <span className="text-sm text-slate-500">No active agents to assign.</span>}
        {agents.map((agent) => {
          const ok = eligible(agent.id, scope);
          const on = selected.includes(agent.id);
          const service = agentServices?.[agent.id];
          return (
            <label
              key={agent.id}
              title={
                ok
                  ? undefined
                  : agentScopes
                    ? "Not assigned to this client - assign the client first (Admin dashboard, Agent Client Status)."
                    : `Not assigned to this service${service && isAgentService(service) ? ` (${AGENT_SERVICE_LABELS[service]} only)` : ""} - change it on the CRM Agents page.`
              }
              className={`rounded-full border px-3 py-1 text-[12.5px] ${ok || on ? "cursor-pointer" : "cursor-not-allowed opacity-45"} ${
                on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
              }`}
            >
              <input type="checkbox" className="hidden" checked={on} disabled={(!ok && !on) || isPending} onChange={() => toggle(agent.id)} />
              {agent.name}
              {!ok && <span className="ml-1 text-[10.5px]">({agentScopes ? "no client access" : "not eligible"})</span>}
            </label>
          );
        })}
      </div>
      {selected.length === 0 && <p className="mt-2 text-[12px] text-amber-700">No agents selected - saving will leave this list with no assigned agents.</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={isPending || selected.length === 0 || (!!clientOptions && !clientId) || (!!campaignsByClient && !scope) || selectedCampaignInactive}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {isPending ? "Saving…" : "Save Assignment"}
        </button>
      </div>
      {campaignManager && campaignModal && (
        <CampaignFormModal
          key={campaignModal === "edit" ? scope : "new"}
          mode={campaignModal}
          clientLabel={clientOptions?.find((option) => option.value === clientId)?.label ?? ""}
          initial={campaignModal === "edit" ? (selectedCampaign ?? null) : null}
          agents={agents}
          defaultAgentIds={selected}
          submit={(input) => (campaignModal === "edit" && selectedCampaign ? campaignManager.updateAction(selectedCampaign.id, input) : campaignManager.createAction(clientId, input))}
          onSaved={(campaign) => handleCampaignSaved(campaign, campaignModal === "create")}
          onClose={() => setCampaignModal(null)}
        />
      )}
    </div>
  );
}
