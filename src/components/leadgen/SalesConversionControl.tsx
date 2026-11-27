"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSalesConversionAction } from "@/lib/sales-bonus-actions";
import { SALES_BONUS_AGENT_STATUS_LABELS, SALES_BONUS_AGENT_STATUS_STYLES, type SaleConfirmationState } from "@/lib/sales-bonus";

// Admin-only control (rendered only on Lead Gen admin pages; the Server
// Action and database function both re-check the role). Confirming creates
// the CA$50 bonus for the credited agent in "Pending approval" - nothing is
// approved or paid here.
export default function SalesConversionControl({ appointmentId, state, agentName }: { appointmentId: string; state: SaleConfirmationState; agentName?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (state.kind === "no_program") return null;
  if (state.kind === "confirmed") {
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SALES_BONUS_AGENT_STATUS_STYLES[state.bonus.agent_payment_status]}`}>
        Sale confirmed · bonus {SALES_BONUS_AGENT_STATUS_LABELS[state.bonus.agent_payment_status].toLowerCase()}
      </span>
    );
  }
  if (state.kind === "ineligible") return <span className="text-xs text-slate-400">{state.reason}</span>;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await confirmSalesConversionAction(appointmentId, notes);
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-fit rounded-full bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700">
          Confirm Sale
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2 sm:w-80">
          <p className="text-xs text-emerald-900">
            Confirm this appointment resulted in a sale? {agentName ? `${agentName} earns` : "The credited agent earns"} a CA$50 bonus (pending your approval).
          </p>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="rounded border border-emerald-300 px-2 py-1 text-xs text-slate-900" />
          <div className="flex gap-2">
            <button type="button" disabled={isPending} onClick={submit} className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {isPending ? "Saving…" : "Yes, confirm sale"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700">Cancel</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
