"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Target, BookOpen, ListChecks, MessageSquare, CheckCircle2, XCircle, AlertTriangle, Lightbulb, FileText } from "lucide-react";
import type { CrmTrainingModuleWithContent, CrmTrainingProgressRow } from "@/lib/crm-training-types";
import { isModuleCompletedForUser } from "@/lib/crm-training-types";

type ActionResult = { error?: string };

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5">
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        <span className="text-sky-600">{icon}</span>
        {title}
      </div>
      <div className="mt-3 text-[14px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

function ListSection({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone?: "danger" | "warning" }) {
  if (items.length === 0) return null;
  const bulletColor = tone === "danger" ? "text-rose-500" : tone === "warning" ? "text-amber-500" : "text-sky-500";
  return (
    <Section icon={icon} title={title}>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1 ${bulletColor}`}>&#8226;</span>
            <span className="whitespace-pre-wrap">{item}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function TrainingModuleReader({
  module,
  progress,
  backHref,
  isAdminPreview,
  markOpenedAction,
  markCompleteAction,
}: {
  module: CrmTrainingModuleWithContent;
  progress: CrmTrainingProgressRow | null;
  backHref: string;
  /** True when an admin is viewing a module that isn't active/published yet. */
  isAdminPreview?: boolean;
  markOpenedAction: (moduleId: string) => Promise<ActionResult>;
  markCompleteAction: (moduleId: string) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const completed = isModuleCompletedForUser(module, progress ?? undefined) || justCompleted;

  useEffect(() => {
    markOpenedAction(module.id);
    // Only fire once, when this reader first mounts for this module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module.id]);

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await markCompleteAction(module.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setJustCompleted(true);
    });
  }

  const { content } = module;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={backHref} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
        &larr; Back to Training
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{module.title}</h1>
        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${module.is_required ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
          {module.is_required ? "Required" : "Optional"}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${completed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {completed ? "Completed" : "Not Completed"}
        </span>
      </div>

      {isAdminPreview && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Draft — this module is not active yet, so agents cannot see it.
        </p>
      )}

      {completed && progress?.completed_at && (
        <p className="mt-3 text-[12.5px] text-slate-500">Completed on {formatDateTime(progress.completed_at)}.</p>
      )}

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <Section icon={<Target size={18} />} title="Learning Objective">
        <p className="whitespace-pre-wrap">{content.learningObjective}</p>
      </Section>

      <Section icon={<BookOpen size={18} />} title="Explanation">
        <p className="whitespace-pre-wrap">{content.explanation}</p>
      </Section>

      <ListSection icon={<ListChecks size={18} />} title="Step-by-Step" items={content.steps} />
      <ListSection icon={<MessageSquare size={18} />} title="Practical Examples" items={content.examples} />
      <ListSection icon={<CheckCircle2 size={18} />} title="Approved Phrases" items={content.approvedPhrases} />
      <ListSection icon={<XCircle size={18} />} title="Phrases to Avoid" items={content.phrasesToAvoid} tone="danger" />
      <ListSection icon={<AlertTriangle size={18} />} title="Common Mistakes" items={content.commonMistakes} tone="warning" />
      <ListSection icon={<Lightbulb size={18} />} title="Key Reminders" items={content.keyReminders} />

      <Section icon={<FileText size={18} />} title="Summary">
        <p className="whitespace-pre-wrap">{content.summary}</p>
      </Section>

      <div className="mt-6 mb-10 flex flex-wrap gap-3">
        {!completed ? (
          <button
            type="button"
            disabled={isPending}
            onClick={handleComplete}
            className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isPending ? "Saving…" : "Mark Module Complete"}
          </button>
        ) : (
          <span className="rounded-full bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">You have completed this module.</span>
        )}
      </div>
    </div>
  );
}
