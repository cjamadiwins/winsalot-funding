"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { CrmTrainingModuleWithContent } from "@/lib/crm-training-types";

type ActionResult = { error?: string; moduleId?: string };

export default function AdminTrainingDashboardClient({
  modules,
  agentCount,
  avgCompletion,
  reorderAction,
  setActiveAction,
  setRequiredAction,
}: {
  modules: CrmTrainingModuleWithContent[];
  agentCount: number;
  avgCompletion: number;
  reorderAction: (orderedModuleIds: string[]) => Promise<ActionResult>;
  setActiveAction: (moduleId: string, isActive: boolean) => Promise<ActionResult>;
  setRequiredAction: (moduleId: string, isRequired: boolean) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState(modules.map((m) => m.id));

  const orderedModules = orderedIds.map((id) => modules.find((m) => m.id === id)).filter((m): m is CrmTrainingModuleWithContent => !!m);

  function runAction(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[index], next[target]] = [next[target], next[index]];
    setOrderedIds(next);
    runAction(() => reorderAction(next));
  }

  const activeCount = modules.filter((m) => m.is_active).length;
  const requiredCount = modules.filter((m) => m.is_required).length;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Total Modules</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{modules.length}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Active / Required</div>
          <div className="mt-1 text-lg font-bold text-slate-900">
            {activeCount} / {requiredCount}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Active Agents</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{agentCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-500">Avg. Required Completion</div>
          <div className="mt-1 text-lg font-bold text-emerald-600">{avgCompletion}%</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/crm/winsalot-training/new" className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + New Module
        </Link>
        <Link href="/admin/crm/winsalot-training/learn" className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          View / Complete as a Learner
        </Link>
        <Link href="/admin/crm/winsalot-training/progress" className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Agent Progress
        </Link>
      </div>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Required</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {orderedModules.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No training modules yet.
                </td>
              </tr>
            )}
            {orderedModules.map((module, index) => (
              <tr key={module.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isPending || index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={isPending || index === orderedModules.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">
                  <Link href={`/admin/crm/winsalot-training/${module.id}`} className="hover:underline">
                    {module.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runAction(() => setActiveAction(module.id, !module.is_active))}
                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${module.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
                  >
                    {module.is_active ? "Active" : "Draft"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runAction(() => setRequiredAction(module.id, !module.is_required))}
                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${module.is_required ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {module.is_required ? "Required" : "Optional"}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-500">v{module.current_version}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/admin/crm/winsalot-training/${module.id}`} className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">
                      Edit
                    </Link>
                    <Link href={`/admin/crm/winsalot-training/${module.id}/read`} className="text-[12px] font-semibold text-slate-600 hover:text-slate-800">
                      Preview
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
