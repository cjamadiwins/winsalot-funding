"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignmentWouldRestrictAgentClient, removalWouldUnrestrictAgentClient } from "@/lib/leadgen-agent-client-rules";

type ActionResult = { error?: string; remainingLists?: number };
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
  setPrimary,
}: {
  agents: Agent[];
  clients: ClientOption[];
  assignClient: (agentId: string, clientId: string, confirmed?: boolean) => Promise<ActionResult>;
  removeClient: (agentId: string, clientId: string, confirmed?: boolean) => Promise<ActionResult>;
  setPrimary: (agentId: string, clientId: string | null) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

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

  function remove(agent: Agent, client: Agent["clients"][number]) {
    const unrestricts = removalWouldUnrestrictAgentClient(agent.totalRows, client.rows);
    const message = unrestricts
      ? `${client.name} is ${agent.name}'s last assigned client.\n\nWith none assigned they will be able to see every client. Remove it anyway?\n\nPast calls, leads, appointments, emails and reports stay under ${client.name}.`
      : `Remove ${client.name} from ${agent.name}?\n\nPast calls, leads, appointments, emails and reports stay under ${client.name}; only the assignment is removed.`;
    if (!window.confirm(message)) return;
    run(
      agent.id,
      () => removeClient(agent.id, client.id, unrestricts),
      (r) => (r.remainingLists ? `${agent.name} is still on ${r.remainingLists} of ${client.name}'s call list(s) - manage that in Client Assignments.` : null)
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
    </div>
  );
}
