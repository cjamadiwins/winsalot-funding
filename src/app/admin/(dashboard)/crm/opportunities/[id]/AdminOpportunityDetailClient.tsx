"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  CLOSED_STAGES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_TYPE_LABELS,
  isOverdue,
  overdueDurationLabel,
  toDatetimeLocal,
  type CrmActivityRow,
  type CrmFollowUpRow,
  type CrmOpportunityRow,
  type CrmUserRow,
  type LatestCrmLeadEmail,
} from "@/lib/crm-types";
import EmailStatusPanel from "@/components/EmailStatusPanel";
import CloseOpportunityPanel from "@/components/CloseOpportunityPanel";
import {
  addActivityAction,
  closeOpportunityAction,
  deleteOpportunityAction,
  updateOpportunityAction,
} from "./actions";
import {
  completeFollowUpAction,
  rescheduleFollowUpAction,
  scheduleFollowUpAction,
} from "../../followup-actions";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

export default function AdminOpportunityDetailClient({
  opportunity,
  activities,
  followUps,
  agents,
  latestEmail,
}: {
  opportunity: CrmOpportunityRow;
  activities: CrmActivityRow[];
  followUps: CrmFollowUpRow[];
  agents: CrmUserRow[];
  latestEmail: LatestCrmLeadEmail | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  function runAction(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const isClosed = CLOSED_STAGES.includes(opportunity.stage);
  const showLeadGenFields =
    opportunity.opportunity_type === "lead_generation" || opportunity.opportunity_type === "both_services";
  const showFinancingFields =
    opportunity.opportunity_type === "business_financing" || opportunity.opportunity_type === "both_services";

  function handleDelete() {
    if (isClosed) return;
    if (!confirm(`Permanently delete the opportunity "${opportunity.business_name}"? This cannot be undone.`)) {
      return;
    }
    runAction(async () => {
      await deleteOpportunityAction(opportunity.id);
      window.location.href = "/admin/crm";
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{opportunity.business_name}</h1>
          <p className="mt-1 text-sm text-slate-500">{OPPORTUNITY_TYPE_LABELS[opportunity.opportunity_type]}</p>
        </div>
        <button
          type="button"
          disabled={isPending || isClosed}
          onClick={handleDelete}
          title={isClosed ? "Closed opportunities cannot be deleted — kept for reporting." : undefined}
          className="rounded-full border border-rose-300 px-4 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Delete Opportunity
        </button>
      </div>

      {isOverdue(opportunity) && opportunity.next_follow_up_at && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          Overdue — {overdueDurationLabel(opportunity.next_follow_up_at)} (was due{" "}
          {new Date(opportunity.next_follow_up_at).toLocaleString()})
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <EmailStatusPanel latestEmail={latestEmail} />

      <CloseOpportunityPanel
        opportunityId={opportunity.id}
        opportunity={opportunity}
        isPending={isPending}
        closeAction={closeOpportunityAction}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Opportunity Details
          </h2>
          <form
            action={(formData) => runAction(() => updateOpportunityAction(opportunity.id, formData))}
            className="mt-4 space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labeled label="Stage">
                <select name="stage" defaultValue={opportunity.stage} className={inputClasses}>
                  {OPPORTUNITY_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Assigned Agent">
                <select
                  name="assigned_agent_id"
                  defaultValue={opportunity.assigned_agent_id ?? ""}
                  className={inputClasses}
                >
                  <option value="">Unassigned</option>
                  {agents
                    .filter((a) => a.active)
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.full_name || agent.email}
                      </option>
                    ))}
                </select>
              </Labeled>
              <Labeled label="Business Name">
                <input
                  name="business_name"
                  defaultValue={opportunity.business_name}
                  required
                  className={inputClasses}
                />
              </Labeled>
              <Labeled label="Contact Name">
                <input name="contact_name" defaultValue={opportunity.contact_name ?? ""} className={inputClasses} />
              </Labeled>
              <Labeled label="Phone">
                <input name="phone" defaultValue={opportunity.phone} required className={inputClasses} />
              </Labeled>
              <Labeled label="Email">
                <input name="email" type="email" defaultValue={opportunity.email ?? ""} className={inputClasses} />
              </Labeled>
              <Labeled label="City">
                <input name="city" defaultValue={opportunity.city ?? ""} className={inputClasses} />
              </Labeled>
              <Labeled label="Province / State">
                <input
                  name="province_state"
                  defaultValue={opportunity.province_state ?? ""}
                  className={inputClasses}
                />
              </Labeled>

              {showLeadGenFields && (
                <>
                  <Labeled label="Industry">
                    <input name="industry" defaultValue={opportunity.industry ?? ""} className={inputClasses} />
                  </Labeled>
                  <Labeled label="Target Customers">
                    <input
                      name="target_customers"
                      defaultValue={opportunity.target_customers ?? ""}
                      className={inputClasses}
                    />
                  </Labeled>
                  <Labeled label="Current Marketing Method">
                    <input
                      name="current_marketing_method"
                      defaultValue={opportunity.current_marketing_method ?? ""}
                      className={inputClasses}
                    />
                  </Labeled>
                  <Labeled label="Number of Appointments Wanted">
                    <input
                      name="appointments_wanted"
                      type="number"
                      min={0}
                      defaultValue={opportunity.appointments_wanted ?? ""}
                      className={inputClasses}
                    />
                  </Labeled>
                  <Labeled label="Estimated Monthly Budget">
                    <input
                      name="estimated_monthly_budget"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={opportunity.estimated_monthly_budget ?? ""}
                      className={inputClasses}
                    />
                  </Labeled>
                  <Labeled label="Consultation Date">
                    <input
                      name="consultation_date"
                      type="datetime-local"
                      defaultValue={
                        opportunity.consultation_date ? toDatetimeLocal(opportunity.consultation_date) : ""
                      }
                      className={inputClasses}
                    />
                  </Labeled>
                </>
              )}

              {showFinancingFields && (
                <>
                  <Labeled label="Corporation or Sole Proprietorship">
                    <select
                      name="business_structure"
                      defaultValue={opportunity.business_structure ?? ""}
                      className={inputClasses}
                    >
                      <option value="">—</option>
                      <option value="corporation">Corporation</option>
                      <option value="sole_proprietorship">Sole Proprietorship</option>
                    </select>
                  </Labeled>
                  <Labeled label="Time in Business">
                    <input
                      name="time_in_business"
                      defaultValue={opportunity.time_in_business ?? ""}
                      className={inputClasses}
                    />
                  </Labeled>
                  <Labeled label="Average Monthly Revenue">
                    <input
                      name="average_monthly_revenue"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={opportunity.average_monthly_revenue ?? ""}
                      className={inputClasses}
                    />
                  </Labeled>
                  <Labeled label="Financing Amount Requested">
                    <input
                      name="financing_amount_requested"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={opportunity.financing_amount_requested ?? ""}
                      className={inputClasses}
                    />
                  </Labeled>
                  <Labeled label="Application Status">
                    <input
                      name="application_status"
                      defaultValue={opportunity.application_status ?? ""}
                      className={inputClasses}
                    />
                  </Labeled>
                  <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      name="bank_statements_available"
                      value="true"
                      defaultChecked={opportunity.bank_statements_available ?? false}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Six Months of Bank Statements Available
                  </label>
                </>
              )}
            </div>
            <Labeled label="Notes">
              <textarea
                name="notes"
                defaultValue={opportunity.notes ?? ""}
                className={`${inputClasses} min-h-[90px] resize-y`}
              />
            </Labeled>
            <div className="text-xs text-slate-500">
              Created {new Date(opportunity.created_at).toLocaleString()}
              {opportunity.last_contacted_at &&
                ` · Last contacted ${new Date(opportunity.last_contacted_at).toLocaleString()}`}
            </div>
            <button type="submit" disabled={isPending} className={buttonClasses}>
              Save Changes
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Scheduled Callbacks
              </h2>
              <button
                type="button"
                onClick={() => setShowSchedule((v) => !v)}
                className="text-sm font-semibold text-sky-600 hover:text-sky-700"
              >
                {showSchedule ? "Cancel" : "+ Schedule"}
              </button>
            </div>

            {showSchedule && (
              <form
                action={(formData) => {
                  runAction(() => scheduleFollowUpAction(opportunity.id, formData));
                  setShowSchedule(false);
                }}
                className="mt-3 space-y-2"
              >
                <input type="datetime-local" name="scheduled_at" required className={inputClasses} />
                <input name="note" placeholder="Short note (optional)" className={inputClasses} />
                <button type="submit" disabled={isPending} className={buttonClasses}>
                  Schedule
                </button>
              </form>
            )}

            {followUps.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No callbacks scheduled for this opportunity.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {followUps.map((followUp) => (
                  <li key={followUp.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">
                        {new Date(followUp.scheduled_at).toLocaleString()}
                      </span>
                    </div>
                    {followUp.note && <p className="mt-1 text-slate-700">{followUp.note}</p>}
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => completeFollowUpAction(followUp.id, opportunity.id))}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        Mark Completed
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          setReschedulingId(reschedulingId === followUp.id ? null : followUp.id)
                        }
                        className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                      >
                        Reschedule
                      </button>
                    </div>
                    {reschedulingId === followUp.id && (
                      <form
                        action={(formData) => {
                          runAction(() => rescheduleFollowUpAction(followUp.id, opportunity.id, formData));
                          setReschedulingId(null);
                        }}
                        className="mt-2 space-y-2"
                      >
                        <input
                          type="datetime-local"
                          name="scheduled_at"
                          required
                          defaultValue={toDatetimeLocal(followUp.scheduled_at)}
                          className={inputClasses}
                        />
                        <input
                          name="note"
                          required
                          placeholder="Reason for rescheduling (required)"
                          className={inputClasses}
                        />
                        <button type="submit" disabled={isPending} className={buttonClasses}>
                          Save
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Log Activity
          </h2>
          <form
            action={(formData) => runAction(() => addActivityAction(opportunity.id, formData))}
            className="mt-4 space-y-3"
          >
            <select name="activity_type" required className={inputClasses} defaultValue="note">
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <textarea
              name="notes"
              placeholder="What happened?"
              className={`${inputClasses} min-h-[70px] resize-y`}
            />
            <Labeled label="Next Follow-up (optional)">
              <input type="datetime-local" name="next_follow_up_at" className={inputClasses} />
            </Labeled>
            <button type="submit" disabled={isPending} className={buttonClasses}>
              Save Activity
            </button>
          </form>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Activity History
          </h2>
          {activities.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No activity logged yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activities.map((activity) => (
                <li key={activity.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {ACTIVITY_TYPE_LABELS[activity.activity_type]}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(activity.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  {activity.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{activity.notes}</p>
                  )}
                  {activity.next_follow_up_at && (
                    <p className="mt-1 text-xs text-slate-500">
                      Next follow-up: {new Date(activity.next_follow_up_at).toLocaleString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
    </label>
  );
}
