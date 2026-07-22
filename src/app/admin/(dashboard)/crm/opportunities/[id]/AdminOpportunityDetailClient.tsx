"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  toDatetimeLocal,
  type ActivityType,
  type CrmUserRow,
} from "@/lib/crm-types";
import {
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_STYLES,
  OPPORTUNITY_TYPE_LABELS,
  INTENT_LEVEL_STYLES,
  LEAD_CATEGORY_STYLES,
  type ActiveCleaningOpportunityRow,
  type OpportunityActivityRow,
  type OpportunityAuditLogRow,
  type OpportunityFollowUpRow,
  type OpportunityStatus,
} from "@/lib/opportunities/types";
import {
  addOpportunityActivityAction,
  archiveOpportunityAction,
  assignOpportunityAgentAction,
  completeOpportunityFollowUpAction,
  deleteOpportunityAction,
  rescheduleOpportunityFollowUpAction,
  restoreOpportunityAction,
  scheduleOpportunityFollowUpAction,
  updateOpportunityFieldsAction,
  updateOpportunityStatusAction,
} from "../actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function AdminOpportunityDetailClient({
  opportunity,
  activities,
  followUps,
  auditLog,
  agents,
}: {
  opportunity: ActiveCleaningOpportunityRow;
  activities: OpportunityActivityRow[];
  followUps: OpportunityFollowUpRow[];
  auditLog: OpportunityAuditLogRow[];
  agents: CrmUserRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const assignedAgent = opportunity.assigned_agent ? agentById.get(opportunity.assigned_agent) : null;

  function runAction(fn: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  function actorLabel(actorId: string | null): string {
    if (!actorId) return "System (daily collection)";
    const actor = agentById.get(actorId);
    return actor?.full_name || actor?.email || "Unknown";
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/crm/opportunities" className="text-xs font-medium text-sky-600 hover:text-sky-700">
            &larr; Back to Cleaning Opportunities
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {opportunity.organization_name || opportunity.opportunity_title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {opportunity.opportunity_title} · {[opportunity.city, opportunity.province].filter(Boolean).join(", ")}
          </p>
          {opportunity.archived_at && (
            <p className="mt-1 text-xs font-medium text-slate-400">
              Archived {new Date(opportunity.archived_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${LEAD_CATEGORY_STYLES[opportunity.lead_category]}`}
          >
            {opportunity.lead_category}
          </span>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${INTENT_LEVEL_STYLES[opportunity.intent_level]}`}
          >
            {opportunity.intent_level} ({opportunity.intent_score})
          </span>
          <select
            value={opportunity.status}
            disabled={isPending}
            onChange={(e) => runAction(() => updateOpportunityStatusAction(opportunity.id, e.target.value as OpportunityStatus))}
            className={`rounded-full border-none px-3 py-1.5 text-xs font-semibold ${OPPORTUNITY_STATUS_STYLES[opportunity.status]}`}
          >
            {OPPORTUNITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Details</h2>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="text-xs font-medium text-sky-600 hover:text-sky-700"
              >
                {editing ? "Cancel" : "Edit"}
              </button>
            </div>

            {editing ? (
              <form
                action={(formData) =>
                  runAction(() => updateOpportunityFieldsAction(opportunity.id, formData), () => setEditing(false))
                }
                className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <label className="text-xs font-medium text-slate-500">
                  Organization name
                  <input name="organization_name" defaultValue={opportunity.organization_name ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Opportunity title
                  <input name="opportunity_title" defaultValue={opportunity.opportunity_title} required className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  City
                  <input name="city" defaultValue={opportunity.city ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Province
                  <select name="province" defaultValue={opportunity.province ?? ""} className={`mt-1 ${inputClass}`}>
                    <option value="">—</option>
                    <option value="BC">BC</option>
                    <option value="ON">ON</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Service needed
                  <input name="service_needed" defaultValue={opportunity.service_needed ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Industry
                  <input name="industry" defaultValue={opportunity.industry ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Deadline
                  <input type="date" name="deadline" defaultValue={opportunity.deadline ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Contact name
                  <input name="contact_name" defaultValue={opportunity.contact_name ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Website
                  <input name="website" defaultValue={opportunity.website ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Public email
                  <input name="public_email" type="email" defaultValue={opportunity.public_email ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Public phone
                  <input name="public_phone" defaultValue={opportunity.public_phone ?? ""} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="col-span-full text-xs font-medium text-slate-500">
                  Description
                  <textarea name="description" defaultValue={opportunity.description ?? ""} rows={3} className={`mt-1 ${inputClass}`} />
                </label>
                <label className="col-span-full text-xs font-medium text-slate-500">
                  Internal notes
                  <textarea name="notes" defaultValue={opportunity.notes ?? ""} rows={2} className={`mt-1 ${inputClass}`} />
                </label>
                <div className="col-span-full">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <Field label="Opportunity Type" value={OPPORTUNITY_TYPE_LABELS[opportunity.opportunity_type]} />
                <Field label="Service Needed" value={opportunity.service_needed} />
                <Field label="Industry" value={opportunity.industry} />
                <Field label="Contact Name" value={opportunity.contact_name} />
                <Field label="Public Email" value={opportunity.public_email} />
                <Field label="Public Phone" value={opportunity.public_phone} />
                <Field label="Website" value={opportunity.website} />
                <Field label="Date Posted" value={opportunity.date_posted ? new Date(opportunity.date_posted).toLocaleDateString() : null} />
                <Field label="Deadline" value={opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString() : null} />
                <Field label="Date Discovered" value={new Date(opportunity.date_discovered).toLocaleDateString()} />
                <Field label="Source" value={opportunity.source_name} />
                <Field label="Last Follow-up" value={opportunity.last_contacted_at ? new Date(opportunity.last_contacted_at).toLocaleDateString() : null} />
                <Field label="Next Follow-up" value={opportunity.next_follow_up_at ? new Date(opportunity.next_follow_up_at).toLocaleString() : null} />
                <Field
                  label="Matched Cleaning Terms"
                  value={opportunity.matched_cleaning_terms?.length ? opportunity.matched_cleaning_terms.join(", ") : null}
                />
                {opportunity.description && (
                  <div className="col-span-full">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Description</dt>
                    <dd className="mt-0.5 text-slate-700">{opportunity.description}</dd>
                  </div>
                )}
                {opportunity.accepted_reason && (
                  <div className="col-span-full">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Why This Was Accepted
                    </dt>
                    <dd className="mt-0.5 text-slate-700">{opportunity.accepted_reason}</dd>
                  </div>
                )}
                {opportunity.notes && (
                  <div className="col-span-full">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Internal Notes</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-slate-700">{opportunity.notes}</dd>
                  </div>
                )}
              </dl>
            )}

            <a
              href={opportunity.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400"
            >
              Open Original Source
            </a>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Activity &amp; Notes</h2>
            <form
              action={(formData) => runAction(() => addOpportunityActivityAction(opportunity.id, formData))}
              className="mt-3 space-y-2"
            >
              <div className="flex flex-wrap gap-2">
                <select name="activity_type" defaultValue="note" className={`w-40 ${inputClass}`}>
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
              <textarea name="notes" placeholder="Call notes..." rows={2} className={inputClass} />
              <button
                type="submit"
                disabled={isPending}
                className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
              >
                Log Activity
              </button>
            </form>

            <ul className="mt-4 space-y-3">
              {activities.map((activity) => (
                <li key={activity.id} className="border-t border-slate-100 pt-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {ACTIVITY_TYPE_LABELS[activity.activity_type]} · {actorLabel(activity.agent_id)}
                    </span>
                    <span>{new Date(activity.occurred_at).toLocaleString()}</span>
                  </div>
                  {activity.notes && <p className="mt-1 text-slate-700">{activity.notes}</p>}
                </li>
              ))}
              {activities.length === 0 && <p className="text-sm text-slate-400">No activity logged yet.</p>}
            </ul>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Scheduled Callbacks</h2>
              <button
                type="button"
                onClick={() => setShowSchedule((v) => !v)}
                className="text-xs font-medium text-sky-600 hover:text-sky-700"
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
                  className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Schedule
                </button>
              </form>
            )}

            <ul className="mt-4 space-y-2">
              {followUps.map((followUp) => (
                <li key={followUp.id} className="rounded-lg border border-slate-100 p-3 text-sm">
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
                      <button type="submit" disabled={isPending} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                        Save
                      </button>
                      <button type="button" onClick={() => setReschedulingId(null)} className="text-xs text-slate-500">
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className={followUp.status === "completed" ? "text-slate-400 line-through" : "font-medium text-slate-800"}>
                          {new Date(followUp.scheduled_at).toLocaleString()}
                        </span>
                        {followUp.note && <span className="ml-2 text-slate-500">{followUp.note}</span>}
                      </div>
                      {followUp.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => runAction(() => completeOpportunityFollowUpAction(followUp.id, opportunity.id))}
                            disabled={isPending}
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                          >
                            Mark Completed
                          </button>
                          <button
                            type="button"
                            onClick={() => setReschedulingId(followUp.id)}
                            className="text-xs font-medium text-sky-600 hover:text-sky-700"
                          >
                            Reschedule
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
              {followUps.length === 0 && <p className="text-sm text-slate-400">No callbacks scheduled.</p>}
            </ul>
          </div>
        </div>

        <div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Assignment</h2>
            {assignedAgent && (
              <p className="mt-1 text-xs text-slate-500">Currently assigned to {assignedAgent.full_name || assignedAgent.email}</p>
            )}
            <select
              value={opportunity.assigned_agent ?? ""}
              disabled={isPending}
              onChange={(e) => runAction(() => assignOpportunityAgentAction(opportunity.id, e.target.value || null))}
              className={`mt-2 ${inputClass}`}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email}
                </option>
              ))}
            </select>

            <div className="mt-4 flex flex-wrap gap-2">
              {opportunity.archived_at ? (
                <button
                  type="button"
                  onClick={() => runAction(() => restoreOpportunityAction(opportunity.id))}
                  disabled={isPending}
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:border-emerald-400 disabled:opacity-50"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => runAction(() => archiveOpportunityAction(opportunity.id))}
                  disabled={isPending}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Permanently delete "${opportunity.opportunity_title}"? This cannot be undone.`)) {
                    runAction(() => deleteOpportunityAction(opportunity.id));
                  }
                }}
                disabled={isPending}
                className="rounded-full border border-rose-300 px-3 py-1 text-xs font-medium text-rose-600 hover:border-rose-400 disabled:opacity-50"
              >
                Delete Permanently
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Audit Log</h2>
            <ul className="mt-3 space-y-2 text-xs">
              {auditLog.map((entry) => (
                <li key={entry.id} className="border-t border-slate-100 pt-2 text-slate-600">
                  <div className="flex justify-between">
                    <span className="font-medium capitalize text-slate-800">{entry.action.replace("_", " ")}</span>
                    <span className="text-slate-400">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-slate-500">{actorLabel(entry.actor_id)}</div>
                  {entry.details && <div className="mt-0.5 text-slate-500">{entry.details}</div>}
                </li>
              ))}
              {auditLog.length === 0 && <p className="text-slate-400">No history yet.</p>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{value || "—"}</dd>
    </div>
  );
}
