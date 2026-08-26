"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  isOverdue,
  overdueDurationLabel,
  toDatetimeLocal,
  type CrmFollowUpRow,
  type CrmOpportunityRow,
} from "@/lib/crm-types";
import Modal from "@/components/Modal";
import CloseOpportunityPanel from "@/components/CloseOpportunityPanel";
import {
  closeOpportunityAction,
  completeOpportunityFollowUpAction,
  rescheduleOpportunityFollowUpAction,
} from "../opportunities/[id]/actions";

const bigButtonClass =
  "min-h-[48px] w-full rounded-xl px-4 py-3 text-[14.5px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50";

// Winsalot Growth CRM equivalent of the old OverdueLeadsPanel - the single,
// prominent "handle this without opening the opportunity" surface for
// overdue opportunities, sitting at the very top of /agent/dashboard above
// the Follow-Up Calendar and My Opportunities table. Each overdue
// opportunity gets three big, thumb-friendly actions instead of requiring
// a trip to the full opportunity page for routine follow-up handling.
export default function OverdueOpportunitiesPanel({
  opportunities,
  followUps,
}: {
  opportunities: CrmOpportunityRow[];
  followUps: CrmFollowUpRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reschedulingOpportunityId, setReschedulingOpportunityId] = useState<string | null>(null);
  const [closingOpportunityId, setClosingOpportunityId] = useState<string | null>(null);

  const overdueOpportunities = useMemo(
    () =>
      opportunities
        .filter(isOverdue)
        .sort((a, b) => new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime()),
    [opportunities]
  );

  // The pending callback driving each opportunity's next_follow_up_at (the
  // earliest one) - Reschedule/Completed act on this specific row, the
  // same one the database's own "earliest pending" trigger would pick
  // (migration 0082).
  const earliestFollowUpByOpportunity = useMemo(() => {
    const map = new Map<string, CrmFollowUpRow>();
    for (const followUp of followUps) {
      if (followUp.status !== "pending" || !followUp.opportunity_id) continue;
      const existing = map.get(followUp.opportunity_id);
      if (!existing || new Date(followUp.scheduled_at) < new Date(existing.scheduled_at)) {
        map.set(followUp.opportunity_id, followUp);
      }
    }
    return map;
  }, [followUps]);

  function runAction(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  if (overdueOpportunities.length === 0) return null;

  const reschedulingOpportunity = overdueOpportunities.find((o) => o.id === reschedulingOpportunityId) ?? null;
  const reschedulingFollowUp = reschedulingOpportunityId
    ? (earliestFollowUpByOpportunity.get(reschedulingOpportunityId) ?? null)
    : null;
  const closingOpportunity = overdueOpportunities.find((o) => o.id === closingOpportunityId) ?? null;

  return (
    <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 sm:p-5">
      <h2 className="text-[15px] font-bold uppercase tracking-wide text-red-700">
        Overdue ({overdueOpportunities.length})
      </h2>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-[var(--crm-surface)] px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {overdueOpportunities.map((opportunity) => {
          const followUp = earliestFollowUpByOpportunity.get(opportunity.id) ?? null;
          return (
            <li key={opportunity.id} className="rounded-xl border border-red-200 bg-[var(--crm-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/agent/opportunities/${opportunity.id}`}
                  className="font-semibold text-[var(--color-ink-strong)] hover:text-[var(--color-accent)]"
                >
                  {opportunity.business_name}
                </Link>
                <span className="text-[12.5px] font-semibold text-red-700">
                  {overdueDurationLabel(opportunity.next_follow_up_at!)}
                </span>
              </div>
              <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                {opportunity.contact_name ? `${opportunity.contact_name} · ` : ""}
                {opportunity.phone}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={!followUp || isPending}
                  onClick={() => setReschedulingOpportunityId(opportunity.id)}
                  className={`${bigButtonClass} bg-[var(--color-accent)] hover:opacity-90`}
                >
                  Called — Reschedule
                </button>
                <button
                  type="button"
                  disabled={!followUp || isPending}
                  onClick={() => runAction(() => completeOpportunityFollowUpAction(followUp!.id, opportunity.id))}
                  className={`${bigButtonClass} bg-emerald-600 hover:bg-emerald-700`}
                >
                  Completed
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setClosingOpportunityId(opportunity.id)}
                  className={`${bigButtonClass} bg-slate-500 hover:bg-slate-600`}
                >
                  Close Opportunity
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {reschedulingOpportunity && reschedulingFollowUp && (
        <Modal title="Called — Reschedule" onClose={() => setReschedulingOpportunityId(null)}>
          <p className="text-sm text-slate-600">{reschedulingOpportunity.business_name}</p>
          <form
            action={(formData) =>
              runAction(
                () => rescheduleOpportunityFollowUpAction(reschedulingFollowUp.id, reschedulingOpportunity.id, formData),
                () => setReschedulingOpportunityId(null)
              )
            }
            className="mt-3 space-y-3"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Outcome / note</span>
              <textarea
                name="note"
                required
                autoFocus
                placeholder="What happened on the call?"
                className="min-h-[80px] w-full resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">New follow-up date &amp; time</span>
              <input
                type="datetime-local"
                name="scheduled_at"
                required
                defaultValue={toDatetimeLocal(reschedulingFollowUp.scheduled_at)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </label>
            {error && <p className="text-sm font-medium text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={isPending}
              className={`${bigButtonClass} bg-[var(--color-accent)] hover:opacity-90`}
            >
              Save
            </button>
          </form>
        </Modal>
      )}

      {closingOpportunity && (
        <Modal title="Close Opportunity" onClose={() => setClosingOpportunityId(null)}>
          <p className="text-sm text-slate-600">{closingOpportunity.business_name}</p>
          <div className="mt-3">
            <CloseOpportunityPanel
              opportunityId={closingOpportunity.id}
              opportunity={closingOpportunity}
              isPending={isPending}
              closeAction={closeOpportunityAction}
              onClosed={() => setClosingOpportunityId(null)}
              embedded
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
