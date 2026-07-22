"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, toDatetimeLocal, type ActivityType } from "@/lib/crm-types";
import {
  AGENT_SETTABLE_OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_STYLES,
  INTENT_LEVEL_STYLES,
  LEAD_CATEGORY_STYLES,
  type ActiveCleaningOpportunityRow,
  type OpportunityActivityRow,
  type OpportunityFollowUpRow,
} from "@/lib/opportunities/types";
import {
  addOpportunityActivityAction,
  completeOpportunityFollowUpAction,
  rescheduleOpportunityFollowUpAction,
  scheduleOpportunityFollowUpAction,
  updateOpportunityStatusAction,
} from "../actions";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14.5px]";

export default function AgentOpportunityDetailClient({
  opportunity,
  activities,
  followUps,
  currentAgentId,
}: {
  opportunity: ActiveCleaningOpportunityRow;
  activities: OpportunityActivityRow[];
  followUps: OpportunityFollowUpRow[];
  currentAgentId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  return (
    <div>
      <Link href="/agent/opportunities" className="text-[13px] font-medium text-[var(--color-accent)]">
        &larr; Back to Cleaning Opportunities
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-bold text-[var(--color-ink-strong)]">
            {opportunity.organization_name || opportunity.opportunity_title}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {opportunity.service_needed || opportunity.opportunity_title} ·{" "}
            {[opportunity.city, opportunity.province].filter(Boolean).join(", ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${LEAD_CATEGORY_STYLES[opportunity.lead_category]}`}>
            {opportunity.lead_category}
          </span>
          <span className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${INTENT_LEVEL_STYLES[opportunity.intent_level]}`}>
            {opportunity.intent_level}
          </span>
          <select
            value={opportunity.status}
            disabled={isPending}
            onChange={(e) => runAction(() => updateOpportunityStatusAction(opportunity.id, e.target.value))}
            className={`rounded-full border-none px-3.5 py-2 text-[13px] font-semibold ${OPPORTUNITY_STATUS_STYLES[opportunity.status]}`}
          >
            {AGENT_SETTABLE_OPPORTUNITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <section className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] sm:grid-cols-3">
          <Field label="Organization" value={opportunity.organization_name} />
          <Field label="City" value={[opportunity.city, opportunity.province].filter(Boolean).join(", ")} />
          <Field label="Service Needed" value={opportunity.service_needed} />
          <Field label="Industry" value={opportunity.industry} />
          <Field label="Public Phone" value={opportunity.public_phone} />
          <Field label="Public Email" value={opportunity.public_email} />
          <Field label="Deadline" value={opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString() : null} />
        </dl>
        {opportunity.description && (
          <p className="mt-3 text-[14px] text-[var(--color-text-body)]">{opportunity.description}</p>
        )}
        <a
          href={opportunity.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-full border border-[var(--color-border)] px-4 py-1.5 text-[12.5px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)]"
        >
          Open Original Source
        </a>
      </section>

      <section className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Call Notes
        </h2>
        <form
          action={(formData) => runAction(() => addOpportunityActivityAction(opportunity.id, formData))}
          className="mt-3 space-y-2"
        >
          <div className="flex flex-wrap gap-2">
            <select name="activity_type" defaultValue="call" className={`w-40 ${inputClass}`}>
              {ACTIVITY_TYPES.map((type: ActivityType) => (
                <option key={type} value={type}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              name="next_follow_up_at"
              className={`w-56 ${inputClass}`}
              title="Optional: schedule a follow-up callback"
            />
          </div>
          <textarea name="notes" placeholder="What happened on this call?" rows={2} className={inputClass} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Save Note
          </button>
        </form>

        <ul className="mt-4 space-y-3">
          {activities.map((activity) => (
            <li key={activity.id} className="border-t border-[var(--color-border-soft)] pt-3 text-[14px]">
              <div className="flex items-center justify-between text-[12px] text-[var(--color-text-muted)]">
                <span>
                  {ACTIVITY_TYPE_LABELS[activity.activity_type]} ·{" "}
                  {activity.agent_id === currentAgentId ? "You" : "Team"}
                </span>
                <span>{new Date(activity.occurred_at).toLocaleString()}</span>
              </div>
              {activity.notes && <p className="mt-1 text-[var(--color-text-body)]">{activity.notes}</p>}
            </li>
          ))}
          {activities.length === 0 && (
            <p className="text-[14px] text-[var(--color-text-muted)]">No notes logged yet.</p>
          )}
        </ul>
      </section>

      <section className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Scheduled Callbacks
          </h2>
          <button
            type="button"
            onClick={() => setShowSchedule((v) => !v)}
            className="text-[12.5px] font-medium text-[var(--color-accent)]"
          >
            {showSchedule ? "Cancel" : "+ Schedule Callback"}
          </button>
        </div>

        {showSchedule && (
          <form
            action={(formData) =>
              runAction(() => scheduleOpportunityFollowUpAction(opportunity.id, formData), () => setShowSchedule(false))
            }
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="datetime-local" name="scheduled_at" required className={`w-56 ${inputClass}`} />
            <input name="note" placeholder="Note (optional)" className={`w-56 ${inputClass}`} />
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Schedule
            </button>
          </form>
        )}

        <ul className="mt-4 space-y-2">
          {followUps.map((followUp) => (
            <li key={followUp.id} className="rounded-lg border border-[var(--color-border-soft)] p-3 text-[14px]">
              {reschedulingId === followUp.id ? (
                <form
                  action={(formData) =>
                    runAction(
                      () => rescheduleOpportunityFollowUpAction(followUp.id, opportunity.id, formData),
                      () => setReschedulingId(null)
                    )
                  }
                  className="flex flex-wrap items-end gap-2"
                >
                  <input
                    type="datetime-local"
                    name="scheduled_at"
                    defaultValue={toDatetimeLocal(followUp.scheduled_at)}
                    required
                    className={`w-56 ${inputClass}`}
                  />
                  <input name="note" defaultValue={followUp.note ?? ""} className={`w-56 ${inputClass}`} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white"
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setReschedulingId(null)} className="text-[12.5px] text-[var(--color-text-muted)]">
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span
                      className={
                        followUp.status === "completed"
                          ? "text-[var(--color-text-muted)] line-through"
                          : "font-medium text-[var(--color-ink-strong)]"
                      }
                    >
                      {new Date(followUp.scheduled_at).toLocaleString()}
                    </span>
                    {followUp.note && <span className="ml-2 text-[var(--color-text-muted)]">{followUp.note}</span>}
                  </div>
                  {followUp.status === "pending" && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => runAction(() => completeOpportunityFollowUpAction(followUp.id, opportunity.id))}
                        disabled={isPending}
                        className="text-[12.5px] font-medium text-emerald-600"
                      >
                        Mark Completed
                      </button>
                      <button
                        type="button"
                        onClick={() => setReschedulingId(followUp.id)}
                        className="text-[12.5px] font-medium text-[var(--color-accent)]"
                      >
                        Reschedule
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
          {followUps.length === 0 && (
            <p className="text-[14px] text-[var(--color-text-muted)]">No callbacks scheduled.</p>
          )}
        </ul>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--color-ink)]">{value || "—"}</dd>
    </div>
  );
}
