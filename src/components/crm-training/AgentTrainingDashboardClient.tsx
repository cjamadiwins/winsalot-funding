"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import type { CrmTrainingModuleWithContent, CrmTrainingProgressRow } from "@/lib/crm-training-types";
import { computeTrainingProgressSummary, findNextIncompleteModule, isModuleCompletedForUser } from "@/lib/crm-training-types";
import TrainingProgressBar from "./TrainingProgressBar";

export default function AgentTrainingDashboardClient({
  modules,
  progressByModuleId,
  basePath,
}: {
  modules: CrmTrainingModuleWithContent[];
  progressByModuleId: Record<string, Pick<CrmTrainingProgressRow, "module_version" | "completed_at">>;
  /** "/agent/winsalot-training" or "/admin/crm/winsalot-training/learn" */
  basePath: string;
}) {
  const progressMap = new Map(Object.entries(progressByModuleId));
  const summary = computeTrainingProgressSummary(modules, progressMap);
  const nextModule = findNextIncompleteModule(modules, progressMap);

  return (
    <div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overall Progress</div>
            <div className="mt-1 text-3xl font-bold text-slate-900">{summary.percentComplete}%</div>
            <div className="mt-1 text-[12.5px] text-slate-500">
              {summary.completedRequired} of {summary.totalRequired} required modules completed
              {summary.totalOptional > 0 && ` · ${summary.completedOptional} of ${summary.totalOptional} optional`}
            </div>
          </div>
          {nextModule && (
            <Link
              href={`${basePath}/${nextModule.id}`}
              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              Continue Training <ArrowRight size={16} />
            </Link>
          )}
        </div>
        <div className="mt-4">
          <TrainingProgressBar percent={summary.percentComplete} />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {modules.length === 0 && (
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] px-4 py-8 text-center text-sm text-slate-500">
            No training modules are available yet.
          </p>
        )}
        {modules.map((module) => {
          const completed = isModuleCompletedForUser(module, progressMap.get(module.id));
          return (
            <Link
              key={module.id}
              href={`${basePath}/${module.id}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4 transition hover:border-sky-300 sm:p-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                {completed ? <CheckCircle2 className="shrink-0 text-emerald-500" size={22} /> : <Circle className="shrink-0 text-slate-300" size={22} />}
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{module.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${module.is_required ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                      {module.is_required ? "Required" : "Optional"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${completed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {completed ? "Completed" : "Not Completed"}
                    </span>
                  </div>
                </div>
              </div>
              <ArrowRight className="shrink-0 text-slate-300" size={18} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
