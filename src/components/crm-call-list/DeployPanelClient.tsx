"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Rocket } from "lucide-react";

export default function DeployPanelClient({
  segmentId,
  agents,
  deployAction,
}: {
  segmentId: string;
  agents: { id: string; name: string }[];
  deployAction: (segmentId: string, agentIds: string[]) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function handleDeploy() {
    if (selected.length === 0) {
      setError("Select at least one agent.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deployAction(segmentId, selected);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Deploy / Assign Segment</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">Once deployed, only the agents you pick can see and work this list.</p>
      {error && <p className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
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
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={isPending}
          onClick={handleDeploy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Rocket className="h-4 w-4" /> {isPending ? "Deploying…" : "Deploy / Assign Segment"}
        </button>
      </div>
    </div>
  );
}
