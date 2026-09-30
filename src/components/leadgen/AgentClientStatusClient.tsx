"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignmentWouldRestrictAgentClient, removalWouldUnrestrictAgentClient } from "@/lib/leadgen-agent-client-rules";

type ActionResult = { error?: string; removedFromLists?: number };
type RemoveOptions = {
  lists?: "none" | "reassign" | "unassign";
  reassignTo?: string | null;
  primary?: "keep" | "clear" | "set";
  newPrimaryClientId?: string | null;
  confirmedUnrestricted?: boolean;
};
type RemovePreview = {
  clientName: string;
  lastAssignment: boolean;
  primaryAffected: boolean;
  activeLists: { id: string; name: string }[];
  eligibleAgents: { id: string; name: string }[];
  otherClients: { id: string; name: string }[];
  leadsStillOwned: number;
};
type ClientOption = { id: string; name: string };
type Agent = {
  id: string;
  name: string;
  clients: { id: string; name: string; rows: number }[];
  totalRows: number;
  primaryClientId: string | null;
};

// Admin-only control (the server actions enforce admin). Shows each agent's
// assigned clients and their Primary/Current client, and lets Admin add or
// remove client assignments. Removing only deletes the assignment - nothing
// recorded under a client (calls, leads, appointments, emails, reports) is
// touched. An explicit call-list client always overrides the Primary client.
export default function AgentClientStatusClient({
  agents,
  clients,
  assignClient,
  removeClient,
  previewRemove,
  setPrimary,
}: {
  agents: Agent[];
  clients: ClientOption[];
  assignClient: (agentId: string, clientId: string, confirmed?: boolean) => Promise<ActionResult>;
  removeClient: (agentId: string, clientId: string, options?: RemoveOptions) => Promise<ActionResult>;
  previewRemove: (agentId: string, clientId: string) => Promise<{ error?: string; preview?: RemovePreview }>;
  setPrimary: (agentId: string, clientId: string | null) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<{ agent: Agent; client: Agent["clients"][number]; preview: RemovePreview } | null>(null);
  const [listChoice, setListChoice] = useState<"reassign" | "unassign">("reassign");
  const [reassignTo, setReassignTo] = useState("");
  const [primaryChoice, setPrimaryChoice] = useState("");

  function run(agentId: string, action: () => Promise<ActionResult>, note?: (result: ActionResult) => string | null) {
    setErrors((prev) => ({ ...prev, [agentId]: "" }));
    setNotes((prev) => ({ ...prev, [agentId]: "" }));
    setBusyAgentId(agentId);
    startTransition(async () => {
      const result = await action();
      if (result.error) setErrors((prev) => ({ ...prev, [agentId]: result.error! }));
      else {
        const text = note?.(result);
        if (text) setNotes((prev) => ({ ...prev, [agentId]: text }));
        router.refresh();
      }
      setBusyAgentId(null);
    });
  }

  function add(agent: Agent, clientId: string) {
    if (!clientId) return;
    const restricts = assignmentWouldRestrictAgentClient(agent.totalRows);
    if (
      restricts &&
      !window.confirm(`${agent.name} can currently see every client.\n\nAssigning a client limits them to only the clients assigned to them. Continue?`)
    ) {
      return;
    }
    run(agent.id, () => assignClient(agent.id, clientId, restricts));
  }

  // Looks up the agent's ACTIVE call lists for this client first. None: the
  // simple confirmation. Some (or the client is their Primary): a modal where
  // Admin picks what happens to those lists and to Primary.
  async function remove(agent: Agent, client: Agent["clients"][number]) {
    setErrors((prev) => ({ ...prev, [agent.id]: "" }));
    setNotes((prev) => ({ ...prev, [agent.id]: "" }));
    setBusyAgentId(agent.id);
    const { error, preview } = await previewRemove(agent.id, client.id);
    setBusyAgentId(null);
    if (error || !preview) {
      setErrors((prev) => ({ ...prev, [agent.id]: error ?? "Could not check this agent's call lists." }));
      return;
    }

    if (preview.activeLists.length === 0 && !preview.primaryAffected) {
      const unrestricts = removalWouldUnrestrictAgentClient(agent.totalRows, client.rows);
      const message = unrestricts
        ? `${client.name} is ${agent.name}'s last assigned client.\n\nWith none assigned they will be able to see every client. Remove it anyway?\n\nPast calls, leads, appointments, emails and reports stay under ${client.name}.`
        : `Remove ${client.name} from ${agent.name}?\n\nPast calls, leads, appointments, emails and reports stay under ${client.name}; only the assignment is removed.`;
      if (!window.confirm(message)) return;
      run(agent.id, () => removeClient(agent.id, client.id, { lists: "none", primary: "keep", confirmedUnrestricted: unrestricts }));
      return;
    }

    setListChoice(preview.eligibleAgents.length > 0 ? "reassign" : "unassign");
    setReassignTo(preview.eligibleAgents.length === 1 ? preview.eligibleAgents[0].id : "");
    setPrimaryChoice("");
    setDialog({ agent, client, preview });
  }

  function confirmDialog() {
    if (!dialog) return;
    const { agent, client, preview } = dialog;
    const hasLists = preview.activeLists.length > 0;
    const options: RemoveOptions = {
      lists: hasLists ? listChoice : "none",
      reassignTo: hasLists && listChoice === "reassign" ? reassignTo : null,
      primary: !preview.primaryAffected ? "keep" : primaryChoice === "__none" ? "clear" : "set",
      newPrimaryClientId: preview.primaryAffected && primaryChoice && primaryChoice !== "__none" ? primaryChoice : null,
      confirmedUnrestricted: preview.lastAssignment,
    };
    setDialog(null);
    run(agent.id, () => removeClient(agent.id, client.id, options), (r) =>
      r.removedFromLists
        ? listChoice === "reassign"
          ? `${r.removedFromLists} active ${client.name} call list(s) moved from ${agent.name} to ${preview.eligibleAgents.find((a) => a.id === reassignTo)?.name ?? "the selected agent"}.`
          : `${agent.name} was taken off ${r.removedFromLists} active ${client.name} call list(s); they are now unassigned.`
        : null
    );
  }

  return (
    <div className="mt-3 divide-y divide-slate-100">
      {agents.map((agent) => {
        const assignedIds = new Set(agent.clients.map((c) => c.id));
        const available = clients.filter((c) => !assignedIds.has(c.id));
        const primary = agent.clients.find((c) => c.id === agent.primaryClientId) ?? null;
        return (
          <div key={agent.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-800">{agent.name}</span>
              <select
                aria-label={`Add a client for ${agent.name}`}
                value=""
                disabled={isPending || available.length === 0}
                onChange={(e) => add(agent, e.target.value)}
                className="w-full rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 outline-none disabled:opacity-60 sm:w-64"
              >
                <option value="">{available.length === 0 ? "All clients assigned" : "+ Add client…"}</option>
                {available.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            {agent.clients.length === 0 ? (
              <p className="mt-1.5 text-[13px] text-slate-500">
                No clients assigned{agent.totalRows === 0 ? " - this agent can see every client." : "."}
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {agent.clients.map((client) => {
                  const isPrimary = client.id === agent.primaryClientId;
                  return (
                    <li key={client.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-slate-700">
                      <span className="min-w-[200px]">• {client.name}</span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(agent.id, () => setPrimary(agent.id, isPrimary ? null : client.id))}
                        className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold disabled:opacity-60 ${
                          isPrimary ? "bg-sky-100 text-sky-700" : "border border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-700"
                        }`}
                        title={isPrimary ? "Click to clear the Primary client" : "Make this the Primary / Current client"}
                      >
                        {isPrimary ? "★ Primary" : "Make primary"}
                      </button>
                      <button type="button" disabled={isPending} onClick={() => remove(agent, client)} className="text-[12px] font-medium text-rose-600 hover:underline disabled:opacity-60">
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-1.5 text-[13px] font-semibold text-slate-700">
              Primary: <span className={primary ? "text-sky-700" : "font-medium text-slate-500"}>{primary ? primary.name : "Not selected"}</span>
            </p>
            {busyAgentId === agent.id && <p className="mt-1 text-xs text-slate-500">Saving…</p>}
            {errors[agent.id] && <p className="mt-1 text-xs text-rose-600">{errors[agent.id]}</p>}
            {notes[agent.id] && <p className="mt-1 text-xs text-amber-700">{notes[agent.id]}</p>}
          </div>
        );
      })}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={`Remove ${dialog.client.name} from ${dialog.agent.name}`}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              Remove {dialog.client.name} from {dialog.agent.name}?
            </h3>

            {dialog.preview.activeLists.length > 0 && (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>
                  {dialog.agent.name} is currently assigned to {dialog.preview.activeLists.length} active {dialog.client.name} call list
                  {dialog.preview.activeLists.length === 1 ? "" : "s"}. Choose what happens to {dialog.preview.activeLists.length === 1 ? "it" : "them"}:
                </p>
                <label className="flex items-start gap-2">
                  <input type="radio" name="list-choice" className="mt-1" checked={listChoice === "reassign"} disabled={dialog.preview.eligibleAgents.length === 0} onChange={() => setListChoice("reassign")} />
                  <span className={dialog.preview.eligibleAgents.length === 0 ? "text-slate-400" : ""}>
                    Reassign them to another eligible agent
                    {dialog.preview.eligibleAgents.length === 0 && <span className="block text-xs">No other agent is assigned to {dialog.client.name}.</span>}
                  </span>
                </label>
                {listChoice === "reassign" && dialog.preview.eligibleAgents.length > 0 && (
                  <select aria-label="Reassign call lists to" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                    <option value="">Select an agent…</option>
                    {dialog.preview.eligibleAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <label className="flex items-start gap-2">
                  <input type="radio" name="list-choice" className="mt-1" checked={listChoice === "unassign"} onChange={() => setListChoice("unassign")} />
                  <span>Remove {dialog.agent.name} from those call lists without reassigning them</span>
                </label>
                <details className="ml-6 text-xs text-slate-500">
                  <summary className="cursor-pointer">Show the call list(s)</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {dialog.preview.activeLists.map((l) => (
                      <li key={l.id}>{l.name}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}

            {dialog.preview.primaryAffected && (
              <div className="mt-4 text-sm text-slate-700">
                <p className="font-semibold">{dialog.client.name} is {dialog.agent.name}&rsquo;s Primary client. Choose a new Primary:</p>
                <select aria-label="New Primary client" value={primaryChoice} onChange={(e) => setPrimaryChoice(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                  <option value="">Select…</option>
                  {dialog.preview.otherClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__none">Leave Primary unselected</option>
                </select>
              </div>
            )}

            {dialog.preview.lastAssignment && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This is {dialog.agent.name}&rsquo;s last assigned client. With none assigned they will be able to see every client.
              </p>
            )}
            {dialog.preview.leadsStillOwned > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {dialog.preview.leadsStillOwned} lead(s) owned by {dialog.agent.name} for this client keep their owner; only current call-list assignments change.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Past calls, leads, appointments, follow-ups, emails, notes and reports stay exactly as recorded. Completed lists are not changed.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog}
                disabled={
                  (dialog.preview.activeLists.length > 0 && listChoice === "reassign" && !reassignTo) || (dialog.preview.primaryAffected && !primaryChoice)
                }
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dialog.preview.activeLists.length > 0 && listChoice === "reassign" ? "Reassign & remove" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
