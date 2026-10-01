"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { CALL_SCRIPT_MAX_LENGTH } from "@/lib/call-list-script-shared";
import { CAMPAIGN_NOTES_MAX, type CampaignDetail, type CampaignFormInput } from "@/lib/leadgen-campaign-form";

type Agent = { id: string; name: string };

const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-900 disabled:opacity-60";
const labelClass = "block text-[12.5px] font-semibold text-slate-700";

// Compact Admin modal to create or edit a Lead Generation campaign from the Call
// List Assignment panel. Pure form: the parent supplies the (Admin-gated) server
// action, so nothing here widens permissions.
export default function CampaignFormModal({
  mode,
  clientLabel,
  initial,
  agents,
  defaultAgentIds,
  submit,
  onSaved,
  onClose,
}: {
  mode: "create" | "edit";
  clientLabel: string;
  initial: CampaignDetail | null;
  agents: Agent[];
  defaultAgentIds: string[];
  submit: (input: CampaignFormInput) => Promise<{ error?: string; campaign?: CampaignDetail }>;
  onSaved: (campaign: CampaignDetail) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [territory, setTerritory] = useState(initial?.territory ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [script, setScript] = useState(initial?.script ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "active");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [adminNotes, setAdminNotes] = useState(initial?.adminNotes ?? "");
  const [agentIds, setAgentIds] = useState<string[]>(initial ? initial.agentIds : defaultAgentIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Existing campaign agents are locked: removing a client's access runs through
  // the Agent Client Status flow, which also handles Primary client and rosters.
  const locked = new Set(initial?.agentIds ?? []);
  const toggleAgent = (id: string) => setAgentIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await submit({ name, industry, territory, description, script, status, startDate, adminNotes, agentIds });
      if (result.error || !result.campaign) {
        setError(result.error ?? "Failed to save the campaign.");
        return;
      }
      onSaved(result.campaign);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !isPending && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={mode === "create" ? "New Campaign" : "Edit Campaign"} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{mode === "create" ? "New Campaign" : "Edit Campaign"}</h3>
          <button type="button" onClick={onClose} disabled={isPending} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>
            Campaign name *
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} placeholder="e.g. Oakville Pet Care" className={inputClass} />
          </label>
          <label className={labelClass}>
            Client
            <input value={clientLabel} readOnly disabled className={`${inputClass} bg-slate-50`} />
          </label>
          <label className={labelClass}>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isPending} className={inputClass}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className={labelClass}>
            Industry / niche
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={isPending} placeholder="e.g. Pet care" className={inputClass} />
          </label>
          <label className={labelClass}>
            City / territory
            <input value={territory} onChange={(e) => setTerritory(e.target.value)} disabled={isPending} placeholder="e.g. Oakville, ON" className={inputClass} />
          </label>
          <label className={labelClass}>
            Start date (optional)
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={isPending} className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Description / objective
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={isPending} rows={2} className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Custom call script
            <textarea value={script} onChange={(e) => setScript(e.target.value)} disabled={isPending} rows={4} maxLength={CALL_SCRIPT_MAX_LENGTH} className={inputClass} />
            <span className="mt-0.5 block text-[11.5px] font-normal text-slate-500">Leave blank to use the client&apos;s call script. A list-level script still takes precedence for that list.</span>
          </label>
        </div>

        <div className="mt-3 text-[12.5px] font-semibold text-slate-700">Assigned agent(s)</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {agents.length === 0 && <span className="text-sm text-slate-500">No active agents.</span>}
          {agents.map((agent) => {
            const on = agentIds.includes(agent.id);
            const isLocked = locked.has(agent.id);
            return (
              <label
                key={agent.id}
                title={isLocked ? "Already assigned to this campaign. Remove client access from Agent Client Status." : undefined}
                className={`rounded-full border px-3 py-1 text-[12.5px] ${isLocked ? "cursor-not-allowed" : "cursor-pointer"} ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
              >
                <input type="checkbox" className="hidden" checked={on} disabled={isPending || isLocked} onChange={() => toggleAgent(agent.id)} />
                {agent.name}
              </label>
            );
          })}
        </div>
        {mode === "edit" && <p className="mt-1 text-[11.5px] text-slate-500">Ticking adds an agent to this campaign. Agents already on it stay; their client access is removed only from Agent Client Status.</p>}

        <label className={`${labelClass} mt-3`}>
          Internal Admin notes
          <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} disabled={isPending} rows={2} maxLength={CAMPAIGN_NOTES_MAX} placeholder="Visible to Admin only." className={inputClass} />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={isPending || !name.trim()} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {isPending ? "Saving…" : mode === "create" ? "Create Campaign" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
