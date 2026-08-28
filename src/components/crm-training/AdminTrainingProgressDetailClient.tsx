"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { isModuleCompletedForUser, isModuleOpenedForUser } from "@/lib/crm-training-types";
import type { AgentModuleProgressDetail } from "@/lib/crm-training-data";

type ActionResult = { error?: string };

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminTrainingProgressDetailClient({
  agent,
  modules,
  resetAction,
}: {
  agent: { id: string; full_name: string; email: string };
  modules: AgentModuleProgressDetail[];
  resetAction: (userId: string, moduleId: string) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingModule, setConfirmingModule] = useState<AgentModuleProgressDetail | null>(null);

  function confirmReset() {
    if (!confirmingModule) return;
    setError(null);
    startTransition(async () => {
      const result = await resetAction(agent.id, confirmingModule.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmingModule(null);
    });
  }

  const completedCount = modules.filter((m) => isModuleCompletedForUser(m, m.progress ?? undefined)).length;

  return (
    <div>
      <Link href="/admin/crm/winsalot-training/progress" className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
        &larr; Back to Agent Progress
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-slate-900">{agent.full_name}</h1>
      <p className="mt-1 text-[12.5px] text-slate-500">
        {agent.email} · {completedCount} of {modules.length} active modules completed
      </p>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Version Completed</th>
              <th className="px-4 py-3">Completed At</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {modules.map((module) => {
              const completed = isModuleCompletedForUser(module, module.progress ?? undefined);
              const opened = isModuleOpenedForUser(module, module.progress ?? undefined);
              const isStale = !!module.progress && module.progress.module_version !== module.current_version;
              return (
                <tr key={module.id}>
                  <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">
                    {module.title}
                    {module.is_required && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Required</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {completed ? <CheckCircle2 className="text-emerald-500" size={16} /> : <Circle className="text-slate-300" size={16} />}
                      <span>{completed ? "Completed" : opened ? "Opened" : "Not Started"}</span>
                      {isStale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Needs re-completion</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{module.progress ? `v${module.progress.module_version}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(module.progress?.completed_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {module.progress && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setConfirmingModule(module)}
                        className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reset Progress
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmingModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-rose-700">Reset Module Progress</h3>
            <p className="mt-2 text-sm text-slate-600">
              This will permanently clear <span className="font-semibold">{agent.full_name}</span>&apos;s progress on{" "}
              <span className="font-semibold">{confirmingModule.title}</span>. They will need to open and complete it again.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmingModule(null)} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={confirmReset}
                className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isPending ? "Resetting…" : "Reset Progress"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
