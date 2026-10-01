"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_OUTCOMES, FIT_ISSUES, OPPORTUNITY_QUALITIES, type AppointmentFeedbackRow } from "@/lib/leadgen-appointment-prep";

type Result = { error?: string; message?: string };
type Input = { outcome: string; what_happened: string; opportunity_quality: string; fit_issues: string[]; future_notes: string };

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

// Compact post-appointment feedback form for the Client Portal. Collapsed
// behind "Update Appointment Outcome" so the appointment page stays small.
export default function AppointmentFeedbackForm({
  existing,
  submitAction,
  defaultOpen = false,
}: {
  existing: Pick<AppointmentFeedbackRow, "outcome" | "what_happened" | "opportunity_quality" | "fit_issues" | "future_notes"> | null;
  submitAction: (input: Input) => Promise<Result>;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [outcome, setOutcome] = useState<string>(existing?.outcome ?? "");
  const [whatHappened, setWhatHappened] = useState(existing?.what_happened ?? "");
  const [quality, setQuality] = useState<string>(existing?.opportunity_quality ?? "");
  const [fitIssues, setFitIssues] = useState<string[]>(existing?.fit_issues ?? []);
  const [futureNotes, setFutureNotes] = useState(existing?.future_notes ?? "");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleIssue(issue: string) {
    setFitIssues((current) => (current.includes(issue) ? current.filter((i) => i !== issue) : [...current, issue]));
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await submitAction({ outcome, what_happened: whatHappened, opportunity_quality: quality, fit_issues: fitIssues, future_notes: futureNotes });
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setMessage({ kind: "ok", text: result.message ?? "Saved." });
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-[var(--crm-accent,#3e7ef7)] px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90">
          {existing ? "Edit Appointment Outcome" : "Update Appointment Outcome"}
        </button>
        {message && <span className={`text-[12.5px] ${message.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-[13px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Appointment Outcome</span>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={inputClass}>
            <option value="">Select an outcome…</option>
            {FEEDBACK_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>How would you rate this opportunity?</span>
          <div className="flex gap-1.5">
            {OPPORTUNITY_QUALITIES.map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={quality === q}
                onClick={() => setQuality(quality === q ? "" : q)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[12.5px] font-semibold transition ${
                  quality === q ? "border-[var(--crm-accent,#3e7ef7)] bg-[var(--crm-accent,#3e7ef7)] text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>What happened? (optional)</span>
        <textarea rows={2} maxLength={600} value={whatHappened} onChange={(e) => setWhatHappened(e.target.value)} className={inputClass} />
      </label>

      <details open={fitIssues.length > 0} className="rounded-lg border border-slate-200 px-2.5 py-1.5">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-700">Was this not a strong fit? Select any that apply (optional)</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FIT_ISSUES.map((issue) => (
            <button
              key={issue}
              type="button"
              aria-pressed={fitIssues.includes(issue)}
              onClick={() => toggleIssue(issue)}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${
                fitIssues.includes(issue) ? "border-amber-400 bg-amber-100 text-amber-900" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {issue}
            </button>
          ))}
        </div>
      </details>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Notes for Future Appointments (optional)</span>
        <input
          maxLength={600}
          value={futureNotes}
          onChange={(e) => setFutureNotes(e.target.value)}
          placeholder="e.g. Prioritize businesses actively looking to redesign within the next 3 months."
          className={inputClass}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending || !outcome}
          onClick={submit}
          className="rounded-full bg-[var(--crm-accent,#3e7ef7)] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Submit Feedback"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-slate-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">
          Cancel
        </button>
        {message && <span className={`text-[12.5px] ${message.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span>}
      </div>
    </div>
  );
}
