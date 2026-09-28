"use client";

import { useMemo, useState } from "react";
import { buildLeadgenCallScript, type LeadgenCallScriptClientFields } from "@/lib/leadgen-call-script";
import ClientCallScriptPanel from "./ClientCallScriptPanel";

export type CallScriptClientOption = { id: string } & LeadgenCallScriptClientFields;

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

// The compact "Client Call Script" dashboard card (brief: "accessible from
// the main Lead CRM dashboard in a compact section where the user can
// select the client and immediately see the correct script"). Used
// identically on both the Admin and Agent dashboards - only the `clients`
// list passed in differs (Admin gets every active client; Agent gets only
// the clients/campaigns they're permitted to work on). Deliberately its
// own selection state, independent of the existing "Current Business"
// selector (AgentCampaignSelector/leadgen_users.current_campaign_id) -
// this is a quick lookup tool, not a change to what campaign the agent is
// actively working, and never touches that column.
export default function ClientCallScriptSelector({
  clients,
  agentName,
  emptyMessage = "No clients available yet.",
}: {
  clients: CallScriptClientOption[];
  agentName: string;
  emptyMessage?: string;
}) {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [prospectName, setProspectName] = useState("");

  const selectedClient = useMemo(() => clients.find((c) => c.id === selectedClientId) ?? null, [clients, selectedClientId]);
  const script = useMemo(
    () => (selectedClient ? buildLeadgenCallScript({ agentName, prospectBusinessName: prospectName, client: selectedClient }) : null),
    [selectedClient, agentName, prospectName]
  );

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-700">Client Call Script</h2>
      <p className="mt-1 text-sm text-slate-500">Select the client you&apos;re calling for to see their approved script.</p>

      {clients.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Client / Business</span>
              <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className={inputClass}>
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Prospect / Business Name (optional)</span>
              <input
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                placeholder="Who are you calling?"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-4">
            {script ? <ClientCallScriptPanel script={script} compact /> : <p className="text-sm text-slate-500">Select a client to view their call script.</p>}
          </div>
        </>
      )}
    </section>
  );
}
