"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trainingListFieldToTextarea, type CrmTrainingModuleWithContent } from "@/lib/crm-training-types";

type ActionResult = { error?: string; moduleId?: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const textareaClass = `${inputClass} min-h-[90px]`;
const listTextareaClass = `${inputClass} min-h-[110px] font-mono text-[13px]`;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-slate-700">{label}</span>
      {hint && <span className="text-[11.5px] text-slate-500">{hint}</span>}
      {children}
    </label>
  );
}

export default function TrainingModuleEditorClient({
  module,
  createAction,
  updateAction,
}: {
  /** Omit to render the "create new module" form. */
  module?: CrmTrainingModuleWithContent;
  createAction?: (formData: FormData) => Promise<ActionResult>;
  updateAction?: (moduleId: string, formData: FormData, isMajorRevision: boolean) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isMajorRevision, setIsMajorRevision] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = module && updateAction ? await updateAction(module.id, formData, isMajorRevision) : await createAction!(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!module && result.moduleId) {
        router.push(`/admin/crm/winsalot-training/${result.moduleId}`);
        return;
      }
      router.refresh();
    });
  }

  const content = module?.content;

  return (
    <div>
      <Link href="/admin/crm/winsalot-training" className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
        &larr; Back to Winsalot Training
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-slate-900">{module ? `Edit: ${module.title}` : "New Training Module"}</h1>
      {module && <p className="mt-1 text-[12.5px] text-slate-500">Currently published as version {module.current_version}.</p>}

      {module && (
        <div className="mt-4">
          <Link
            href={`/admin/crm/winsalot-training/${module.id}/read`}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Preview this module
          </Link>
        </div>
      )}

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <form action={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <Field label="Title *">
          <input name="title" defaultValue={module?.title} required className={inputClass} />
        </Field>

        {!module && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_required" defaultChecked className="h-4 w-4" />
            <span className="text-[13px] font-medium text-slate-700">This module is required</span>
          </label>
        )}

        <Field label="Learning Objective *" hint="One or two sentences describing what the learner should be able to do afterward.">
          <textarea name="learningObjective" defaultValue={content?.learningObjective} required rows={2} className={textareaClass} />
        </Field>

        <Field label="Explanation *" hint="Short sections. Use a blank line between sections.">
          <textarea name="explanation" defaultValue={content?.explanation} required rows={5} className={textareaClass} />
        </Field>

        <Field label="Step-by-Step Instructions" hint="One step per line.">
          <textarea name="steps" defaultValue={trainingListFieldToTextarea(content?.steps ?? [])} rows={5} className={listTextareaClass} />
        </Field>

        <Field label="Practical Business-Call Examples" hint="One example per line.">
          <textarea name="examples" defaultValue={trainingListFieldToTextarea(content?.examples ?? [])} rows={4} className={listTextareaClass} />
        </Field>

        <Field label="Approved Phrases" hint="One phrase per line.">
          <textarea name="approvedPhrases" defaultValue={trainingListFieldToTextarea(content?.approvedPhrases ?? [])} rows={4} className={listTextareaClass} />
        </Field>

        <Field label="Phrases to Avoid" hint="One phrase per line.">
          <textarea name="phrasesToAvoid" defaultValue={trainingListFieldToTextarea(content?.phrasesToAvoid ?? [])} rows={4} className={listTextareaClass} />
        </Field>

        <Field label="Common Mistakes" hint="One mistake per line.">
          <textarea name="commonMistakes" defaultValue={trainingListFieldToTextarea(content?.commonMistakes ?? [])} rows={4} className={listTextareaClass} />
        </Field>

        <Field label="Key Reminders" hint="One reminder per line.">
          <textarea name="keyReminders" defaultValue={trainingListFieldToTextarea(content?.keyReminders ?? [])} rows={4} className={listTextareaClass} />
        </Field>

        <Field label="Module Summary *" hint="A short wrap-up paragraph.">
          <textarea name="summary" defaultValue={content?.summary} required rows={3} className={textareaClass} />
        </Field>

        {module && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <input type="checkbox" checked={isMajorRevision} onChange={(e) => setIsMajorRevision(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span className="text-[12.5px] text-amber-800">
              <span className="font-semibold">This is a major revision.</span> Every agent (and admin) who already completed this module will be
              required to complete it again. Leave unchecked for a small wording fix that doesn&apos;t need re-completion.
            </span>
          </label>
        )}

        <div>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
            {isPending ? "Saving…" : module ? "Save Changes" : "Create Module"}
          </button>
        </div>
      </form>
    </div>
  );
}
