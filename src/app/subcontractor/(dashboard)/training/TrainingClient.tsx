"use client";

import { useState, useTransition } from "react";
import {
  SUBCONTRACTOR_TRAINING_STATUS_LABELS,
  type SubcontractorTrainingModuleRow,
  type SubcontractorTrainingProgressRow,
} from "@/lib/crm-subcontractor-types";

type ActionResult = { error?: string };

type Props = {
  modules: SubcontractorTrainingModuleRow[];
  progress: SubcontractorTrainingProgressRow[];
  updateProgressAction: (moduleId: string, status: "in_progress" | "completed") => Promise<ActionResult>;
};

const statusBadgeClasses: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
};

export default function TrainingClient({ modules, progress, updateProgressAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const progressByModuleId = new Map(progress.map((p) => [p.module_id, p]));

  const requiredModules = modules.filter((m) => progressByModuleId.get(m.id)?.required_override ?? m.is_required);
  const completedCount = requiredModules.filter((m) => progressByModuleId.get(m.id)?.status === "completed").length;

  function runUpdate(moduleId: string, status: "in_progress" | "completed") {
    setError(null);
    startTransition(async () => {
      const result = await updateProgressAction(moduleId, status);
      if (result?.error) setError(result.error);
    });
  }

  function toggleOpen(moduleId: string) {
    const willOpen = openModuleId !== moduleId;
    setOpenModuleId(willOpen ? moduleId : null);
    const current = progressByModuleId.get(moduleId)?.status ?? "not_started";
    if (willOpen && current === "not_started") runUpdate(moduleId, "in_progress");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Training</h1>
        <p className="mt-1 text-sm text-slate-500">
          {completedCount} of {requiredModules.length} required modules completed
        </p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="space-y-3">
        {modules.map((module) => {
          const moduleProgress = progressByModuleId.get(module.id);
          const status = moduleProgress?.status ?? "not_started";
          const required = moduleProgress?.required_override ?? module.is_required;
          const isOpen = openModuleId === module.id;

          return (
            <div key={module.id} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
              <button type="button" onClick={() => toggleOpen(module.id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
                <div>
                  <p className="font-semibold text-slate-900">{module.title}</p>
                  <p className="text-xs text-slate-500">
                    {required ? "Required" : "Not required"}
                    {moduleProgress?.completed_at && ` · Completed ${new Date(moduleProgress.completed_at).toLocaleDateString()}`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses[status]}`}>
                  {SUBCONTRACTOR_TRAINING_STATUS_LABELS[status]}
                </span>
              </button>

              {isOpen && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="whitespace-pre-line text-sm text-slate-600">{module.content}</p>
                  <button
                    type="button"
                    disabled={isPending || status === "completed"}
                    onClick={() => runUpdate(module.id, "completed")}
                    className="mt-4 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Mark as Completed
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
