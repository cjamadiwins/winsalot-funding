"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LEADGEN_LEAD_CLIENT_FEEDBACK_OPTIONS } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

export default function LeadFeedbackForm({
  leadId,
  submitAction,
}: {
  leadId: string;
  submitAction: (leadId: string, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitAction(leadId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="mt-3 space-y-3">
      <select name="feedback" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900">
        <option value="" disabled>
          Select feedback…
        </option>
        {LEADGEN_LEAD_CLIENT_FEEDBACK_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <textarea
        name="note"
        rows={2}
        placeholder="Optional note"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900"
      />
      {error && <p className="text-[12.5px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-indigo-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        Submit Feedback
      </button>
    </form>
  );
}
