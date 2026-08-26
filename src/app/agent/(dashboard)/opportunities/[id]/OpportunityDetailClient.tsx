"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  AGENT_SETTABLE_STAGES,
  OPPORTUNITY_STAGE_STYLES,
  OPPORTUNITY_TYPE_LABELS,
  toDatetimeLocal,
  type ActivityType,
  type CrmActivityRow,
  type CrmFollowUpRow,
  type CrmOpportunityRow,
} from "@/lib/crm-types";
import OpportunityFieldsForm from "@/components/OpportunityFieldsForm";
import CloseOpportunityPanel from "@/components/CloseOpportunityPanel";
import EmailHistoryPanel, { type EmailHistoryEntry } from "@/components/EmailHistoryPanel";
import ProspectEmailModal from "@/components/ProspectEmailModal";
import {
  addOpportunityActivityAction,
  closeOpportunityAction,
  completeOpportunityFollowUpAction,
  rescheduleOpportunityFollowUpAction,
  scheduleOpportunityFollowUpAction,
  sendProspectEmailAction,
  updateOpportunityFieldsAction,
  updateOpportunityStageAction,
} from "./actions";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14.5px]";

export default function OpportunityDetailClient({
  opportunity,
  activities,
  followUps,
  currentAgentId,
  emailHistory,
  isEmailSuppressed,
  currentUserName,
  bookingUrl,
}: {
  opportunity: CrmOpportunityRow;
  activities: CrmActivityRow[];
  followUps: CrmFollowUpRow[];
  currentAgentId: string;
  emailHistory: EmailHistoryEntry[];
  isEmailSuppressed: boolean;
  currentUserName: string;
  bookingUrl: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  function runAction(fn: () => Promise<unknown>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && typeof result === "object" && "error" in result && (result as { error?: string }).error) {
          setError((result as { error?: string }).error!);
        } else {
          onSuccess?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <Link href="/agent/dashboard#my-opportunities" className="text-[13px] font-medium text-[var(--color-accent)]">
        &larr; Back to My Opportunities
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-bold text-[var(--color-ink-strong)]">
            {opportunity.business_name}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {OPPORTUNITY_TYPE_LABELS[opportunity.opportunity_type]}
            {opportunity.city ? ` · ${[opportunity.city, opportunity.province_state].filter(Boolean).join(", ")}` : ""}
          </p>
        </div>
        <select
          value={opportunity.stage}
          disabled={isPending}
          onChange={(e) => runAction(() => updateOpportunityStageAction(opportunity.id, e.target.value))}
          className={`rounded-full border-none px-3.5 py-2 text-[13px] font-semibold ${OPPORTUNITY_STAGE_STYLES[opportunity.stage]}`}
        >
          {/* If the opportunity's current stage is a closing stage, it
              isn't in AGENT_SETTABLE_STAGES - still surfaced here as a
              disabled-equivalent option so the select shows the true
              current value rather than silently defaulting to the first
              option. Changing away from it goes through this same
              dropdown once AGENT_SETTABLE_STAGES includes the new value;
              changing *into* Client Won/Not Interested is blocked below
              by updateOpportunityStageAction and by the database trigger
              regardless. */}
          {!AGENT_SETTABLE_STAGES.includes(opportunity.stage) && (
            <option value={opportunity.stage}>{opportunity.stage}</option>
          )}
          {AGENT_SETTABLE_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {isEmailSuppressed && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          This prospect has unsubscribed from promotional emails and cannot be sent another consultation invite.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Details
              </h2>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="text-[12.5px] font-medium text-[var(--color-accent)]"
                >
                  {editing ? "Cancel" : "Edit"}
                </button>
                <button
                  type="button"
                  disabled={isEmailSuppressed || !opportunity.email}
                  onClick={() => setShowEmailModal(true)}
                  title={
                    isEmailSuppressed
                      ? "This prospect has unsubscribed from promotional emails."
                      : !opportunity.email
                        ? "This prospect has no email address on file."
                        : undefined
                  }
                  className="rounded-full bg-sky-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send Email
                </button>
              </div>
            </div>

            {editing ? (
              <form
                action={(formData) =>
                  runAction(() => updateOpportunityFieldsAction(opportunity.id, formData), () => setEditing(false))
                }
                className="mt-3"
              >
                <OpportunityFieldsForm
                  defaultOpportunityType={opportunity.opportunity_type}
                  defaults={opportunity}
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="mt-4 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  Save Changes
                </button>
              </form>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] sm:grid-cols-3">
                <Field label="Contact Name" value={opportunity.contact_name} />
                <Field label="Phone" value={opportunity.phone} />
                <Field label="Email" value={opportunity.email} />
                <Field label="City" value={opportunity.city} />
                <Field label="Province / State" value={opportunity.province_state} />
                {(opportunity.opportunity_type === "lead_generation" || opportunity.opportunity_type === "both_services") && (
                  <>
                    <Field label="Industry" value={opportunity.industry} />
                    <Field label="Target Customers" value={opportunity.target_customers} />
                    <Field label="Current Marketing Method" value={opportunity.current_marketing_method} />
                    <Field label="Appointments Wanted" value={opportunity.appointments_wanted?.toString() ?? null} />
                    <Field
                      label="Estimated Monthly Budget"
                      value={opportunity.estimated_monthly_budget != null ? `$${opportunity.estimated_monthly_budget}` : null}
                    />
                    <Field
                      label="Consultation Date"
                      value={opportunity.consultation_date ? new Date(opportunity.consultation_date).toLocaleString() : null}
                    />
                  </>
                )}
                {(opportunity.opportunity_type === "business_financing" || opportunity.opportunity_type === "both_services") && (
                  <>
                    <Field
                      label="Business Structure"
                      value={
                        opportunity.business_structure === "corporation"
                          ? "Corporation"
                          : opportunity.business_structure === "sole_proprietorship"
                            ? "Sole Proprietorship"
                            : null
                      }
                    />
                    <Field label="Time in Business" value={opportunity.time_in_business} />
                    <Field
                      label="Average Monthly Revenue"
                      value={opportunity.average_monthly_revenue != null ? `$${opportunity.average_monthly_revenue}` : null}
                    />
                    <Field
                      label="Financing Amount Requested"
                      value={opportunity.financing_amount_requested != null ? `$${opportunity.financing_amount_requested}` : null}
                    />
                    <Field
                      label="Bank Statements Available"
                      value={opportunity.bank_statements_available === null ? null : opportunity.bank_statements_available ? "Yes" : "No"}
                    />
                    <Field label="Application Status" value={opportunity.application_status} />
                  </>
                )}
              </dl>
            )}
            {!editing && opportunity.notes && (
              <div className="mt-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">Notes</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-[14px] text-[var(--color-text-body)]">{opportunity.notes}</dd>
              </div>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Activity Timeline
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
              <textarea name="notes" placeholder="What happened?" rows={2} className={inputClass} />
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
                <p className="text-[14px] text-[var(--color-text-muted)]">No activity logged yet.</p>
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
                      <input name="note" required placeholder="Reason for rescheduling (required)" className={`w-56 ${inputClass}`} />
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

          <EmailHistoryPanel emails={emailHistory} />
        </div>

        <div>
          <CloseOpportunityPanel
            opportunityId={opportunity.id}
            opportunity={opportunity}
            isPending={isPending}
            closeAction={closeOpportunityAction}
          />
        </div>
      </div>

      {showEmailModal && opportunity.email && (
        <ProspectEmailModal
          businessName={opportunity.business_name}
          contactName={opportunity.contact_name}
          toEmail={opportunity.email}
          opportunityType={opportunity.opportunity_type}
          agentName={currentUserName}
          bookingUrl={bookingUrl}
          onClose={() => setShowEmailModal(false)}
          onSend={(input) => sendProspectEmailAction(opportunity.id, input)}
          onSent={() => window.location.reload()}
        />
      )}
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
