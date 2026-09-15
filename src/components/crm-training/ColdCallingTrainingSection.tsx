"use client";

// Shared "Winsalot Cold Calling Quality Standards" training card, rendered
// on all four Training pages (Growth CRM admin/agent, Lead Generation CRM
// admin/agent). The card + popup shell here is intentionally thin - all of
// the actual manual/quiz content lives once in
// ColdCallingQualityStandardsTraining.tsx so every CRM shows identical
// content, per the brief's "one shared/reusable training component".

import { useState } from "react";
import LargeModal from "@/components/crm-ui/LargeModal";
import ColdCallingQualityStandardsTraining from "./ColdCallingQualityStandardsTraining";
import type { SharedTrainingCompletionRow, SharedTrainingCrm } from "@/lib/shared-training-types";

function CompletionsTable({ completions }: { completions: SharedTrainingCompletionRow[] }) {
  if (completions.length === 0) {
    return <p className="mt-3 text-sm text-[var(--color-text-muted)]">No agent has completed this training yet.</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="py-2 pr-3">Agent</th>
            <th className="py-2 pr-3">Score</th>
            <th className="py-2 pr-3">Result</th>
            <th className="py-2 pr-3">Completed</th>
          </tr>
        </thead>
        <tbody>
          {completions.map((row) => (
            <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0">
              <td className="py-2 pr-3">
                <p className="font-medium text-[var(--color-ink-strong)]">{row.user_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{row.user_email}</p>
              </td>
              <td className="py-2 pr-3 text-[var(--color-ink)]">
                {row.quiz_score}/{row.quiz_total}
              </td>
              <td className="py-2 pr-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    row.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {row.passed ? "Passed" : "Not passed"}
                </span>
              </td>
              <td className="py-2 pr-3 text-[var(--color-ink)]">{new Date(row.completed_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ColdCallingTrainingSection({
  crm,
  role,
  initialCompletion,
  allCompletions,
}: {
  crm: SharedTrainingCrm;
  role: "admin" | "agent";
  initialCompletion: SharedTrainingCompletionRow | null;
  /** Admin-only: every agent's completion status for this manual. Undefined for agents. */
  allCompletions?: SharedTrainingCompletionRow[];
}) {
  const [open, setOpen] = useState(false);
  const completed = initialCompletion !== null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Required Sales Training
          </span>
          <h2 className="mt-2 font-heading text-lg font-bold text-[var(--color-ink-strong)]">
            Winsalot Cold Calling Quality Standards
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Your guide to better outbound calls and stronger customer conversations.
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Estimated time: 10–15 minutes</p>
          {role === "agent" && completed && (
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              ✓ Completed — score {initialCompletion!.quiz_score}/{initialCompletion!.quiz_total}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Open Training Manual
        </button>
      </div>

      {role === "admin" && (
        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <h3 className="text-sm font-bold text-[var(--color-ink-strong)]">Agent Completion Status</h3>
          <CompletionsTable completions={allCompletions ?? []} />
        </div>
      )}

      <LargeModal
        open={open}
        onClose={() => setOpen(false)}
        title="Winsalot Cold Calling Quality Standards"
        subtitle="Required Sales Training · Estimated time: 10–15 minutes"
        maxWidthClassName="max-w-3xl"
      >
        <ColdCallingQualityStandardsTraining crm={crm} initialCompletion={initialCompletion} />
      </LargeModal>
    </div>
  );
}
