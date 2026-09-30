"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { AGENT_SERVICE_LABELS, isAgentService, serviceAllowsOpportunityType, type AgentService } from "@/lib/crm-agent-service-shared";

type Option = { value: string; label: string };
type Agent = { id: string; name: string };

// Admin-only "Save Assignment" for an existing call list, shared by both CRMs:
//   Growth CRM:          Service [Lead Generation / Business Finance] + Assigned Agents
//   Lead Generation CRM: Client [client / campaign]                   + Assigned Agents
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
  agents,
  assignedAgentIds,
  agentServices,
  saveAction,
  helpText,
}: {
  segmentId: string;
  scopeLabel: string;
  scopeOptions: Option[];
  initialScope: string;
  agents: Agent[];
  assignedAgentIds: string[];
  // Growth only: each agent's Admin-set service. When provided, agents who
  // can't take the chosen service are greyed out (the server enforces it too).
  agentServices?: Record<string, AgentService | null>;
  saveAction: (segmentId: string, scope: string, agentIds: string[]) => Promise<{ error?: string; added?: number; removed?: number }>;
  helpText?: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState(initialScope);
  const [selected, setSelected] = useState<string[]>(assignedAgentIds);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const eligible = (agentId: string, forScope: string) => !agentServices || serviceAllowsOpportunityType(agentServices[agentId] ?? null, forScope);

  function changeScope(next: string) {
    setScope(next);
    if (agentServices) {
      const dropped = selected.filter((id) => !eligible(id, next));
      if (dropped.length > 0) {
        setSelected((prev) => prev.filter((id) => eligible(id, next)));
        setNotice(`${dropped.length} agent(s) can't take this service and were unselected.`);
        return;
      }
    }
    setNotice(null);
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveAction(segmentId, scope, selected);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(`Saved. ${result.added ?? 0} agent(s) added, ${result.removed ?? 0} removed.`);
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

      <label className="mt-3 block text-[12.5px] font-semibold text-slate-700">
        {scopeLabel}
        <select
          value={scope}
          onChange={(e) => changeScope(e.target.value)}
          disabled={isPending}
          className="mt-1 block w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 disabled:opacity-60"
        >
          {!scopeOptions.some((o) => o.value === scope) && <option value={scope}>{scope || "Not set"}</option>}
          {scopeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

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
              title={ok ? undefined : `Not assigned to this service${service && isAgentService(service) ? ` (${AGENT_SERVICE_LABELS[service]} only)` : ""} - change it on the CRM Agents page.`}
              className={`rounded-full border px-3 py-1 text-[12.5px] ${ok || on ? "cursor-pointer" : "cursor-not-allowed opacity-45"} ${
                on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
              }`}
            >
              <input type="checkbox" className="hidden" checked={on} disabled={(!ok && !on) || isPending} onChange={() => toggle(agent.id)} />
              {agent.name}
              {!ok && <span className="ml-1 text-[10.5px]">(not eligible)</span>}
            </label>
          );
        })}
      </div>
      {selected.length === 0 && <p className="mt-2 text-[12px] text-amber-700">No agents selected - saving will leave this list with no assigned agents.</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={isPending}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {isPending ? "Saving…" : "Save Assignment"}
        </button>
      </div>
    </div>
  );
}
