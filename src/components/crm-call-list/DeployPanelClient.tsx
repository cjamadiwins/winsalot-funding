"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Rocket } from "lucide-react";

export default function DeployPanelClient({
  segmentId,
  agents,
  assignedAgentIds = [],
  clientOptions,
  initialClientId = "",
  clientLabel,
  campaignLabel,
  industry,
  location,
  productionLeadCount,
  deployAction,
}: {
  segmentId: string;
  agents: { id: string; name: string }[];
  assignedAgentIds?: string[];
  clientOptions?: { id: string; name: string }[];
  initialClientId?: string;
  clientLabel?: string;
  campaignLabel?: string;
  industry?: string | null;
  location?: string | null;
  productionLeadCount?: number;
  deployAction: (segmentId: string, agentIds: string[], clientId?: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  // Seeded from the segment's current roster so an already-assigned agent
  // (e.g. re-opening this panel to remove one agent and add another) shows
  // up pre-selected instead of forcing Admin to re-pick everyone - see the
  // `key` on this component in SegmentPerformanceClient, which remounts it
  // (and so re-seeds this state) whenever the saved roster changes.
  const [selected, setSelected] = useState<string[]>(assignedAgentIds);
  const [clientId, setClientId] = useState(initialClientId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function handleDeploy() {
    if (clientOptions && !clientId) {
      setError("Select a production client before deploying.");
      return;
    }
    if (selected.length === 0) {
      setError("Select at least one agent.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await deployAction(segmentId, selected, clientId || undefined);
      if (result.error) setError(result.error);
      else {
        if (clientLabel) setNotice(`Deployment confirmed. Client / Campaign Owner: ${clientLabel}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Deploy / Assign Segment</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">
        Click an agent to select or unselect them. Selected agents are highlighted below; saving replaces the full assignment list with
        whoever is selected, so unselecting an agent removes their access to this list.
      </p>
      {error && <p className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-2 text-[12.5px] text-emerald-700">{notice}</p>}
      {clientOptions && (
        <label className="mt-3 block text-[12.5px] font-semibold text-slate-700">
          Client
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={isPending} className="mt-1 block w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900">
            <option value="">Select a production client…</option>
            {clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {agents.length === 0 && <span className="text-sm text-slate-500">No active agents to assign.</span>}
        {agents.map((agent) => (
          <label
            key={agent.id}
            className={`cursor-pointer rounded-full border px-3 py-1 text-[12.5px] ${
              selected.includes(agent.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
            }`}
          >
            <input type="checkbox" className="hidden" checked={selected.includes(agent.id)} onChange={() => toggle(agent.id)} />
            {agent.name}
          </label>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-700">
        <div className="font-semibold text-slate-900">Assignment summary</div>
        <div>Client: {clientOptions ? (clientOptions.find((client) => client.id === clientId)?.name ?? "Select a client") : (clientLabel ?? "—")}</div>
        <div>Campaign: {[campaignLabel, industry, location].filter(Boolean).join(" — ") || "—"}</div>
        <div>Assigned Agent(s): {agents.filter((agent) => selected.includes(agent.id)).map((agent) => agent.name).join(", ") || "Select at least one agent"}</div>
        {productionLeadCount !== undefined && <div>Production Leads: {productionLeadCount}</div>}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={isPending || (!!clientOptions && !clientId)}
          onClick={handleDeploy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Rocket className="h-4 w-4" /> {isPending ? "Deploying…" : "Deploy / Assign Segment"}
        </button>
      </div>
    </div>
  );
}
