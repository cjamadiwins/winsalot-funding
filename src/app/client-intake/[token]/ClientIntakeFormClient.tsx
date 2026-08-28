"use client";

import { useState } from "react";
import type { CrmIntakeQuestion } from "@/lib/crm-agreement-types";
import { submitClientIntakeAction } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export default function ClientIntakeFormClient({
  token,
  questions,
  campaignStartDate,
}: {
  token: string;
  questions: CrmIntakeQuestion[];
  campaignStartDate: string | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (submitting || submitted) return;
    const missing = questions.find((q) => q.required && !answers[q.key]?.trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await submitClientIntakeAction(token, answers);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h3 className="text-lg font-bold text-emerald-800">Thank you</h3>
        <p className="mt-2 text-sm text-emerald-700">Your client intake form has been submitted to Winsalot Corp.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Tell Us About Your Business</h3>
      <div className="mt-4 space-y-4">
        {questions.map((question) => (
          <label key={question.key} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">
              {question.label}
              {!question.required && <span className="ml-1.5 font-normal text-slate-400">(optional)</span>}
            </span>
            {question.type === "long_text" ? (
              <textarea
                value={answers[question.key] ?? ""}
                onChange={(e) => setAnswer(question.key, e.target.value)}
                disabled={submitting}
                rows={3}
                className={`${inputClass} resize-y`}
              />
            ) : question.type === "date" ? (
              <input
                type="date"
                value={answers[question.key] ?? ""}
                onChange={(e) => setAnswer(question.key, e.target.value)}
                disabled={submitting}
                className={inputClass}
              />
            ) : question.type === "select" && question.options ? (
              <select value={answers[question.key] ?? ""} onChange={(e) => setAnswer(question.key, e.target.value)} disabled={submitting} className={inputClass}>
                <option value="">Select…</option>
                {question.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={answers[question.key] ?? ""}
                onChange={(e) => setAnswer(question.key, e.target.value)}
                disabled={submitting}
                className={inputClass}
              />
            )}
            {question.key === "preferred_start_date" && campaignStartDate && (
              <span className="text-[12px] text-slate-500">Your signed agreement&apos;s campaign start date is {campaignStartDate}.</span>
            )}
          </label>
        ))}

        {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="w-full rounded-full bg-sky-600 py-3 text-[15px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit Client Intake Form"}
        </button>
      </div>
    </div>
  );
}
