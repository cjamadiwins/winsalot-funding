"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { unstable_rethrow, useSearchParams } from "next/navigation";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
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
import { effectiveOpportunityCategory, OPPORTUNITY_CATEGORY_LABELS, OPPORTUNITY_CATEGORY_STYLES, type CrmOpportunityScoreRow } from "@/lib/opportunity-finder";
import type { CrmEmailSuppressionRow } from "@/lib/crm-email-suppression";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";
import EmailStatusPanel from "@/components/EmailStatusPanel";
import EmailHistoryPanel, { type EmailHistoryEntry } from "@/components/EmailHistoryPanel";
import ProspectEmailModal from "@/components/ProspectEmailModal";
import BookConsultationModal from "@/components/BookConsultationModal";
import CloseOpportunityPanel from "@/components/CloseOpportunityPanel";
import OpportunityFieldsForm from "@/components/OpportunityFieldsForm";
import {
  addActivityAction,
  bookConsultationAction,
  closeOpportunityAction,
  deleteOpportunityAction,
  getConsultationOfferedSlotsAction,
  resubscribeEmailAction,
  sendProspectEmailAction,
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
  emailHistory,
  isEmailSuppressed,
  suppression,
  bookingUrl,
  appointments,
  score,
}: {
  opportunity: CrmOpportunityRow;
  activities: CrmActivityRow[];
  followUps: CrmFollowUpRow[];
  agents: CrmUserRow[];
  latestEmail: LatestCrmLeadEmail | null;
  emailHistory: EmailHistoryEntry[];
  isEmailSuppressed: boolean;
  suppression: CrmEmailSuppressionRow | null;
  bookingUrl: string;
  appointments: WinsalotAppointmentRow[];
  score: CrmOpportunityScoreRow | null;
}) {
  const searchParams = useSearchParams();
  const cameFromOpportunityFinder = searchParams.get("from") === "opportunity-finder";
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);

  function runAction(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        // deleteOpportunityAction redirects internally, which Next.js
        // implements by throwing a special NEXT_REDIRECT-digest error -
        // without this, that error looked just like any other failure
        // here and briefly rendered as a red "Something went wrong."
        // banner in the instant before the redirect actually took over.
        // unstable_rethrow lets that (and notFound()'s NEXT_HTTP_ERROR_
        // FALLBACK) pass through to Next.js untouched; only a real
        // application error reaches setError below.
        unstable_rethrow(err);
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  // Administrators may permanently delete an opportunity regardless of
  // its stage (Open, Won/Client Won, Lost/Not Interested) - every FK
  // pointing at crm_opportunities is ON DELETE CASCADE/SET NULL (see
  // migrations 0082/0085/0087/0088/0097), so a plain delete here is
  // always safe, and the database no longer blocks a closed-stage delete
  // (migration 0104 dropped that trigger). Only an admin can ever reach
  // this page/action (requireCrmAdmin, plus crm_opportunities has no
  // agent delete policy at all), so this stays admin-only regardless.
  //
  // deleteOpportunityAction redirects itself once the delete/revalidate
  // are done - nothing runs here after the await resolves, since a
  // redirect() from a Server Action navigates the browser directly rather
  // than returning normally. No client-side navigation, timeout, or
  // success flag belongs here: staying mounted on this page long enough
  // to show one would mean staying on a detail page whose opportunity no
  // longer exists, which is exactly what used to surface a transient
  // error before the old window.location.href handoff caught up. The
  // "Opportunity deleted" message is shown on the CRM page it redirects
  // to instead (see /admin/crm's ?deleted=opportunity handling).
  function handleDelete() {
    if (!confirm("Are you sure you want to permanently delete this opportunity? This action cannot be undone.")) {
      return;
    }
    runAction(async () => {
      await deleteOpportunityAction(opportunity.id);
    });
  }

  return (
    <div>
      {cameFromOpportunityFinder && (
        <Link href="/admin/crm/opportunity-finder" className="mb-3 inline-block text-[13px] font-semibold text-sky-600 hover:text-sky-700">
          ← Back to Opportunity Finder
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{opportunity.business_name}</h1>
          <p className="mt-1 text-sm text-slate-500">{OPPORTUNITY_TYPE_LABELS[opportunity.opportunity_type]}</p>
          {score && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-lg font-extrabold text-slate-900">{score.score}</span>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${OPPORTUNITY_CATEGORY_STYLES[effectiveOpportunityCategory(score)]}`}
              >
                {OPPORTUNITY_CATEGORY_LABELS[effectiveOpportunityCategory(score)]}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={isPending || isEmailSuppressed || !opportunity.email}
            onClick={() => setShowEmailModal(true)}
            title={
              isEmailSuppressed
                ? "This prospect has unsubscribed from promotional emails."
                : !opportunity.email
                  ? "This prospect has no email address on file."
                  : undefined
            }
            className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send Email
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowBookModal(true)}
            className="rounded-full bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Book Consultation
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="rounded-full border border-rose-300 px-4 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete Opportunity
          </button>
        </div>
      </div>

      {isEmailSuppressed && suppression && (
        <ResubscribePanel opportunity={opportunity} suppression={suppression} />
      )}

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
            </div>

            {/* Owns the Opportunity Type selector plus Business Name/
                Contact/Phone/Email/City/Province-State, every
                type-conditional Lead Generation/Business Financing field,
                and Notes - shared with the agent's own editor
                (src/app/agent/(dashboard)/opportunities/[id]/OpportunityDetailClient.tsx)
                so the two screens can never drift on what fields exist for
                which opportunity_type. */}
            <OpportunityFieldsForm defaultOpportunityType={opportunity.opportunity_type} defaults={opportunity} />

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
              placeholder="Internal details — never shown to clients"
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
            Internal Activity History
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

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Appointments</h2>
        {appointments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No consultation appointments booked for this opportunity yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {appointments.map((appt) => (
              <li key={appt.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{new Date(appt.appointment_start_at).toLocaleString()}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      appt.status === "cancelled" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {appt.status}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">
                  Booked by {appt.booked_by === "self" ? "prospect" : "agent"}
                  {appt.incentive_status ? ` · ${appt.incentive_status}` : ""}
                </p>
                {appt.cancelled_reason && <p className="mt-1 text-xs text-rose-600">Cancelled: {appt.cancelled_reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <EmailHistoryPanel emails={emailHistory} />

      {showEmailModal && opportunity.email && (
        <ProspectEmailModal
          businessName={opportunity.business_name}
          contactName={opportunity.contact_name}
          toEmail={opportunity.email}
          opportunityType={opportunity.opportunity_type}
          bookingUrl={bookingUrl}
          onClose={() => setShowEmailModal(false)}
          onSend={(input) => sendProspectEmailAction(opportunity.id, input)}
          onSent={() => window.location.reload()}
        />
      )}

      {showBookModal && (
        <BookConsultationModal
          businessName={opportunity.business_name}
          contactName={opportunity.contact_name}
          email={opportunity.email}
          phone={opportunity.phone}
          opportunityType={opportunity.opportunity_type}
          getOfferedSlots={getConsultationOfferedSlotsAction}
          onBook={(input) => bookConsultationAction(opportunity.id, input)}
          onClose={() => setShowBookModal(false)}
          onBooked={() => window.location.reload()}
        />
      )}
    </div>
  );
}

// Admin-only "Resubscribe" for a prospect currently blocked by
// crm_email_suppressions. Requires an explicit confirmation checkbox
// (re-enforced server-side in resubscribeEmailAction) plus a required
// description of how the recipient asked to receive emails again -
// stored as the consent method/date on both crm_email_suppressions
// (which is never deleted, only marked inactive - see migration 0120)
// and the append-only crm_email_resubscribe_audit log. "Restore
// individual email permission only" always clears the block; "re-enroll
// in Email Marketing" additionally resets crm_marketing_enrollments back
// to Email 1 with its own fresh consent record - only offered when this
// business is still open and has an email on file, mirroring the same
// two checks resubscribeEmailAction/resubscribeEmail re-run server-side.
function ResubscribePanel({ opportunity, suppression }: { opportunity: CrmOpportunityRow; suppression: CrmEmailSuppressionRow }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [scope, setScope] = useState<"permission_only" | "reenroll_marketing">("permission_only");
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);

  const canReenrollMarketing = !!opportunity.email?.trim() && !["Client Won", "Not Interested"].includes(opportunity.stage);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setResult(null);
    const outcome = await resubscribeEmailAction(opportunity.id, formData);
    setPending(false);
    setResult(outcome);
    if (!outcome.error) {
      setExpanded(false);
      setConfirmed(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-800">
        This prospect has unsubscribed from promotional emails and cannot be sent another consultation invite.
      </p>
      <p className="mt-1 text-xs text-amber-700">
        Unsubscribed {new Date(suppression.suppressed_at).toLocaleString()}
        {suppression.reason && suppression.reason !== "unsubscribed" ? ` — ${suppression.reason}` : ""}.
      </p>

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          Resubscribe
        </button>
      ) : (
        <form action={handleSubmit} className="mt-3 space-y-3 border-t border-amber-200 pt-3">
          <label className="block text-xs font-semibold uppercase text-amber-800">
            How did the recipient ask to receive emails again?
            <textarea
              name="consent_method"
              required
              rows={2}
              placeholder="Example: Called on September 2, 2026 and asked to be added back to our email list."
              className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-800"
            />
          </label>
          <label className="block text-xs font-semibold uppercase text-amber-800">
            Date requested
            <input
              type="date"
              name="consent_date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="mt-1 w-48 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm normal-case text-slate-800"
            />
          </label>

          <div className="space-y-1.5 text-sm text-slate-800">
            <label className="flex items-start gap-2">
              <input type="radio" name="scope" value="permission_only" checked={scope === "permission_only"} onChange={() => setScope("permission_only")} className="mt-0.5" />
              <span>Restore individual email permission only (weekly Email Marketing is not changed).</span>
            </label>
            <label className={`flex items-start gap-2 ${canReenrollMarketing ? "" : "opacity-50"}`}>
              <input
                type="radio"
                name="scope"
                value="reenroll_marketing"
                checked={scope === "reenroll_marketing"}
                onChange={() => setScope("reenroll_marketing")}
                disabled={!canReenrollMarketing}
                className="mt-0.5"
              />
              <span>
                Re-enroll in weekly Email Marketing, starting from Email 1.
                {!canReenrollMarketing && " (Requires an email address on file and an open opportunity.)"}
              </span>
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <input
              type="checkbox"
              name="confirmed"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            <span>I confirm the recipient explicitly requested to receive emails again.</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending || !confirmed}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Resubscribing…" : "Confirm Resubscribe"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setExpanded(false);
                setResult(null);
              }}
              className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {result && (
        <p className={`mt-3 text-xs font-medium ${result.error ? "text-rose-700" : "text-emerald-700"}`}>{result.error ?? result.success}</p>
      )}
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
