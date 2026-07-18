"use client";

import { useState, useTransition } from "react";
import type { CrmUserRow } from "@/lib/crm-types";
import { createAgentAction, updateAgentAction } from "./actions";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

export default function AgentsClient({
  agents,
  leadCounts,
}: {
  agents: CrmUserRow[];
  leadCounts: Record<string, number>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function runAction(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAddAgent((v) => !v)}
        className={buttonClasses}
      >
        {showAddAgent ? "Cancel" : "+ Add Agent"}
      </button>

      {showAddAgent && (
        <form
          action={(formData) =>
            runAction(() => createAgentAction(formData), () => setShowAddAgent(false))
          }
          className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-6"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="full_name" placeholder="Full name" required className={inputClasses} />
            <input name="email" type="email" placeholder="Email" required className={inputClasses} />
            <input
              name="password"
              type="text"
              placeholder="Temporary password (min 8 characters)"
              required
              minLength={8}
              className={inputClasses}
            />
          </div>
          <p className="text-xs text-slate-500">
            Share this password with the agent securely — they can sign in right away at{" "}
            <span className="font-mono">/agent/login</span>.
          </p>
          <button type="submit" disabled={isPending} className={buttonClasses}>
            Create Agent
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} className="border-b border-slate-100 last:border-0 align-top">
                {editingId === agent.id ? (
                  <td colSpan={6} className="px-4 py-4">
                    <form
                      action={(formData) =>
                        runAction(
                          () => updateAgentAction(agent.id, formData),
                          () => setEditingId(null)
                        )
                      }
                      className="flex flex-wrap items-center gap-3"
                    >
                      <input
                        name="full_name"
                        defaultValue={agent.full_name}
                        required
                        className={`${inputClasses} max-w-[200px]`}
                      />
                      <select name="role" defaultValue={agent.role} className={`${inputClasses} max-w-[140px]`}>
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="active" defaultChecked={agent.active} />
                        Active
                      </label>
                      <button type="submit" disabled={isPending} className={buttonClasses}>
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-slate-900">{agent.full_name}</td>
                    <td className="px-4 py-3 text-slate-600">{agent.email}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{agent.role}</td>
                    <td className="px-4 py-3 text-slate-600">{leadCounts[agent.id] ?? 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          agent.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {agent.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingId(agent.id)}
                        className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                      >
                        Edit
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {agents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No agents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
