"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agreedTargetLabel,
  AGREED_TARGET_NOTICE,
  AGREEMENT_SERVICE_TYPE_LABELS,
  findIntakeAgreementConflicts,
  type CrmClientAgreementRow,
  type CrmIntakeConfigRow,
  type CrmIntakeQuestion,
  type CrmIntakeSubmissionRow,
  type CrmIntakeSubmissionEditRow,
} from "@/lib/crm-agreement-types";
import { saveIntakeQuestionsAction, sendIntakeFormAction, resendIntakeFormAction, correctIntakeSubmissionFieldAction } from "../[id]/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses = "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

function newQuestion(): CrmIntakeQuestion {
  return { key: `question_${Date.now()}`, label: "", type: "short_text", required: false };
}

export default function IntakeBuilderClient({
  config,
  agreement,
  submission,
  edits,
}: {
  config: CrmIntakeConfigRow;
  agreement: CrmClientAgreementRow;
  submission: CrmIntakeSubmissionRow | null;
  edits: CrmIntakeSubmissionEditRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<CrmIntakeQuestion[]>(config.questions);
  const [preview, setPreview] = useState(false);

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function updateQuestion(index: number, patch: Partial<CrmIntakeQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const answers = submission ? (submission.corrected_answers ?? submission.answers) : {};
  const conflicts = submission ? findIntakeAgreementConflicts(agreement, answers) : [];
  const conflictByField = new Map(conflicts.map((c) => [c.fieldKey, c]));

  return (
    <div>
      <Link href="/admin/crm/intake" className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
        ← Back to Client Intake
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Client Intake — {agreement.legal_business_name}</h1>
      <p className="text-sm text-slate-500">
        Status: <span className="font-semibold capitalize">{submission ? "Received" : config.status}</span>
      </p>

      {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-base font-bold text-slate-900">Locked Agreement Fields</h2>
        <p className="text-[12.5px] text-slate-500">Prefilled from the signed agreement - the client cannot edit these. Fees are never shown.</p>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <LockedField label="Legal Business Name" value={agreement.legal_business_name} />
          <LockedField label="Contact Person" value={agreement.contact_person} />
          <LockedField label="Business Email" value={agreement.business_email} />
          <LockedField label="Service Type" value={AGREEMENT_SERVICE_TYPE_LABELS[agreement.service_type]} />
          <LockedField label="Campaign Start Date" value={agreement.campaign_start_date ?? "-"} />
          <LockedField label="Agreement Term" value={agreement.initial_term ?? "-"} />
        </dl>
        <div className="mt-3">
          <span className="text-[12.5px] font-semibold text-slate-500">{agreedTargetLabel(agreement.service_type)}</span>
          <p className="text-lg font-bold text-slate-900">{agreement.monthly_target}</p>
          <p className="text-[12px] text-slate-500">{AGREED_TARGET_NOTICE}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Questions</h2>
          <button type="button" onClick={() => setPreview((p) => !p)} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
            {preview ? "Edit Questions" : "Preview Intake Form"}
          </button>
        </div>

        {preview ? (
          <div className="mt-4 space-y-3">
            {questions.map((q) => (
              <div key={q.key}>
                <span className="text-[13px] font-semibold text-slate-600">
                  {q.label || "(untitled question)"} {!q.required && <span className="font-normal text-slate-400">(optional)</span>}
                </span>
              </div>
            ))}
            <p className="text-[12px] text-slate-500">Submit button reads: &quot;Submit Client Intake Form&quot;</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {questions.map((question, index) => (
              <div key={question.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3">
                <input
                  value={question.label}
                  onChange={(e) => updateQuestion(index, { label: e.target.value })}
                  placeholder="Question label"
                  className={`${inputClass} flex-1`}
                />
                <select
                  value={question.type}
                  onChange={(e) => updateQuestion(index, { type: e.target.value as CrmIntakeQuestion["type"] })}
                  className={`${inputClass} w-40`}
                >
                  <option value="short_text">Short Text</option>
                  <option value="long_text">Long Text</option>
                  <option value="date">Date</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={question.required} onChange={(e) => updateQuestion(index, { required: e.target.checked })} />
                  Required
                </label>
                <button type="button" onClick={() => moveQuestion(index, -1)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                  ↑
                </button>
                <button type="button" onClick={() => moveQuestion(index, 1)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                  ↓
                </button>
                <button type="button" onClick={() => removeQuestion(index)} className="text-xs font-semibold text-rose-600 hover:text-rose-700">
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setQuestions((prev) => [...prev, newQuestion()])} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
              + Add Question
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={isPending} onClick={() => runAction(() => saveIntakeQuestionsAction(config.id, questions))} className={buttonClasses}>
            {isPending ? "Saving…" : "Save as Draft"}
          </button>
          {config.status === "draft" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!confirm("Send the intake form to the client now?")) return;
                runAction(() => sendIntakeFormAction(config.id));
              }}
              className={buttonClasses}
            >
              Send Intake Form
            </button>
          )}
          {config.status === "sent" && !submission && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!confirm("Resend the intake link to the client?")) return;
                runAction(() => resendIntakeFormAction(config.id));
              }}
              className={buttonClasses}
            >
              Resend Intake Link
            </button>
          )}
        </div>
      </div>

      {submission && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
          <h2 className="text-base font-bold text-slate-900">Client Submission</h2>
          <div className="mt-3 space-y-3">
            {questions.map((question) => {
              const conflict = conflictByField.get(question.key);
              return (
                <SubmissionField
                  key={question.key}
                  question={question}
                  value={answers[question.key] ?? ""}
                  conflict={conflict}
                  onSave={(newValue) => runAction(() => correctIntakeSubmissionFieldAction(submission.id, question.key, newValue))}
                />
              );
            })}
          </div>

          {edits.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[13px] font-bold text-slate-700">Correction History</h3>
              <ul className="mt-2 space-y-1 text-[12.5px] text-slate-500">
                {edits.map((edit) => (
                  <li key={edit.id}>
                    {edit.field_key}: &quot;{edit.old_value}&quot; → &quot;{edit.new_value}&quot; ({new Date(edit.created_at).toLocaleString()})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12.5px] font-semibold text-slate-500">{label}</dt>
      <dd className="rounded-lg bg-slate-50 px-3 py-1.5 text-slate-700">{value}</dd>
    </div>
  );
}

function SubmissionField({
  question,
  value,
  conflict,
  onSave,
}: {
  question: CrmIntakeQuestion;
  value: string;
  conflict?: { agreementValue: string; intakeValue: string };
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-600">{question.label}</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
            Correct
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1.5 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass} />
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
            className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
          >
            Save
          </button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-800">{value || "-"}</p>
      )}
      {conflict && (
        <p className="mt-1 text-[12px] font-semibold text-rose-600">
          Conflicts with signed agreement ({conflict.agreementValue}) — a change to the agreement requires an amendment or new agreement.
        </p>
      )}
    </div>
  );
}
