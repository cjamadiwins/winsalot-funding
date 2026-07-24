"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  isOverdue,
  overdueDurationLabel,
  toDatetimeLocal,
  type CrmFollowUpRow,
  type CrmLeadRow,
  type CrmUserRow,
} from "@/lib/crm-types";
import Modal from "@/components/Modal";
import CloseLeadPanel from "@/components/CloseLeadPanel";
import { closeLeadAction } from "./leads/[id]/actions";
import { completeFollowUpAction, rescheduleFollowUpAction } from "./followup-actions";

const bigButtonClass =
  "min-h-[48px] w-full rounded-xl px-4 py-3 text-[14.5px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50";

// Admin equivalent of the agent dashboard's OverdueLeadsPanel - same
// three quick actions, same shared Modal/CloseLeadPanel and
// reschedule/complete/close server actions (admin-scoped versions), so an
// admin can handle routine overdue follow-ups across every agent's leads
// without opening each one. Unlike the agent's panel (implicitly "my
// leads"), every card also shows which agent the lead is assigned to.
export default function AdminOverdueLeadsPanel({
  leads,
  followUps,
  agents,
}: {
  leads: CrmLeadRow[];
  followUps: CrmFollowUpRow[];
  agents: CrmUserRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reschedulingLeadId, setReschedulingLeadId] = useState<string | null>(null);
  const [closingLeadId, setClosingLeadId] = useState<string | null>(null);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const overdueLeads = useMemo(
    () =>
      leads
        .filter(isOverdue)
        .sort((a, b) => new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime()),
    [leads]
  );

  const earliestFollowUpByLead = useMemo(() => {
    const map = new Map<string, CrmFollowUpRow>();
    for (const followUp of followUps) {
      if (followUp.status !== "pending") continue;
      const existing = map.get(followUp.lead_id);
      if (!existing || new Date(followUp.scheduled_at) < new Date(existing.scheduled_at)) {
        map.set(followUp.lead_id, followUp);
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

  if (overdueLeads.length === 0) return null;

  const reschedulingLead = overdueLeads.find((l) => l.id === reschedulingLeadId) ?? null;
  const reschedulingFollowUp = reschedulingLeadId
    ? (earliestFollowUpByLead.get(reschedulingLeadId) ?? null)
    : null;
  const closingLead = overdueLeads.find((l) => l.id === closingLeadId) ?? null;

  return (
    <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 sm:p-5">
      <h2 className="text-[15px] font-bold uppercase tracking-wide text-rose-700">
        Overdue ({overdueLeads.length})
      </h2>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {overdueLeads.map((lead) => {
          const followUp = earliestFollowUpByLead.get(lead.id) ?? null;
          const agent = lead.assigned_agent_id ? agentById.get(lead.assigned_agent_id) : null;
          return (
            <li key={lead.id} className="rounded-xl border border-rose-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/admin/crm/leads/${lead.id}`}
                  className="font-semibold text-slate-900 hover:text-sky-600"
                >
                  {lead.business_name}
                </Link>
                <span className="text-[12.5px] font-semibold text-rose-700">
                  {overdueDurationLabel(lead.next_follow_up_at!)}
                </span>
              </div>
              <div className="mt-1 text-[13px] text-slate-500">
                {lead.contact_name ? `${lead.contact_name} · ` : ""}
                {lead.phone} · Assigned to {agent?.full_name || agent?.email || "Unassigned"}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={!followUp || isPending}
                  onClick={() => setReschedulingLeadId(lead.id)}
                  className={`${bigButtonClass} bg-sky-600 hover:bg-sky-700`}
                >
                  Called — Reschedule
                </button>
                <button
                  type="button"
                  disabled={!followUp || isPending}
                  onClick={() =>
                    runAction(() => completeFollowUpAction(followUp!.id, lead.id))
                  }
                  className={`${bigButtonClass} bg-emerald-600 hover:bg-emerald-700`}
                >
                  Completed
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setClosingLeadId(lead.id)}
                  className={`${bigButtonClass} bg-slate-800 hover:bg-slate-900`}
                >
                  Close Lead
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {reschedulingLead && reschedulingFollowUp && (
        <Modal title="Called — Reschedule" onClose={() => setReschedulingLeadId(null)}>
          <p className="text-sm text-slate-600">{reschedulingLead.business_name}</p>
          <form
            action={(formData) =>
              runAction(
                () => rescheduleFollowUpAction(reschedulingFollowUp.id, reschedulingLead.id, formData),
                () => setReschedulingLeadId(null)
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
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={isPending}
              className={`${bigButtonClass} bg-sky-600 hover:bg-sky-700`}
            >
              Save
            </button>
          </form>
        </Modal>
      )}

      {closingLead && (
        <Modal title="Close Lead" onClose={() => setClosingLeadId(null)}>
          <p className="text-sm text-slate-600">{closingLead.business_name}</p>
          <div className="mt-3">
            <CloseLeadPanel
              leadId={closingLead.id}
              lead={closingLead}
              isPending={isPending}
              closeAction={closeLeadAction}
              onClosed={() => setClosingLeadId(null)}
              embedded
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
