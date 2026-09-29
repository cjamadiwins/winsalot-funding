"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ActionResult = { error?: string };
type Agent = { id: string; name: string; clientId: string | null };
type ClientOption = { id: string; name: string };

// Admin-only control (the server action enforces admin). Saves the agent's
// active client to the database, then refreshes so the card, the agent's own
// dashboard and every server-side lookup read the saved value.
export default function AgentClientStatusClient({
  agents,
  clients,
  setAgentClient,
}: {
  agents: Agent[];
  clients: ClientOption[];
  setAgentClient: (agentId: string, clientId: string | null) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function change(agentId: string, clientId: string | null) {
    setErrors((prev) => ({ ...prev, [agentId]: "" }));
    setSavingId(agentId);
    startTransition(async () => {
      const result = await setAgentClient(agentId, clientId);
      if (result.error) setErrors((prev) => ({ ...prev, [agentId]: result.error! }));
      else router.refresh();
      setSavingId(null);
    });
  }

  return (
    <div className="mt-3 divide-y divide-slate-100">
      {agents.map((agent) => (
        <div key={agent.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-800">{agent.name}</span>
            <select
              aria-label={`Active client for ${agent.name}`}
              value={agent.clientId ?? ""}
              disabled={isPending}
              onChange={(e) => change(agent.id, e.target.value || null)}
              className={`w-full rounded-full border px-3 py-1.5 text-sm font-semibold outline-none sm:w-72 ${
                agent.clientId ? "border-sky-200 bg-sky-100 text-sky-700" : "border-slate-200 bg-slate-100 text-slate-500"
              } disabled:opacity-70`}
            >
              <option value="">Not selected (clear)</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          {savingId === agent.id && <p className="mt-1 text-right text-xs text-slate-500">Saving…</p>}
          {errors[agent.id] && <p className="mt-1 text-right text-xs text-rose-600">{errors[agent.id]}</p>}
        </div>
      ))}
    </div>
  );
}
