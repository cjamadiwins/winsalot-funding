"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LEADGEN_OPPORTUNITY_OUTCOMES, type LeadgenOpportunityOutcome } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

const selectClass = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] text-slate-900";
const inputClass = "w-28 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] text-slate-900";

// "Client Consultation Outcome" (brief section 6) - the only part of a
// leadgen_client_opportunities row a client can ever change, enforced at
// the database level (RLS + a column-level GRANT restricted to exactly
// client_outcome/closed_date/deal_value/updated_at). Won reveals
// closed_date + optional deal_value; switching away from Won clears both
// client-side before submit (the server action clears them too either way).
export default function PipelineOutcomeForm({
  opportunityId,
  currentOutcome,
  currentClosedDate,
  currentDealValue,
  submitAction,
}: {
  opportunityId: string;
  currentOutcome: LeadgenOpportunityOutcome;
  currentClosedDate: string | null;
  currentDealValue: number | null;
  submitAction: (opportunityId: string, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<LeadgenOpportunityOutcome>(currentOutcome);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitAction(opportunityId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-center gap-2">
      <select
        name="client_outcome"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as LeadgenOpportunityOutcome)}
        className={selectClass}
      >
        {LEADGEN_OPPORTUNITY_OUTCOMES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {outcome === "Won" && (
        <>
          <input type="date" name="closed_date" defaultValue={currentClosedDate ?? ""} className={inputClass} />
          <input type="number" step="0.01" min="0" name="deal_value" placeholder="Deal value (optional)" defaultValue={currentDealValue ?? ""} className={inputClass} />
        </>
      )}
      <button type="submit" disabled={isPending} className="rounded-full bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
        Save
      </button>
      {error && <p className="w-full text-[12px] text-red-600">{error}</p>}
    </form>
  );
}
