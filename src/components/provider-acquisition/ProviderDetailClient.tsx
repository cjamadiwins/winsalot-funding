"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CANADIAN_PROVINCES_AND_TERRITORIES,
  PROVIDER_CALL_OUTCOMES,
  PROVIDER_SERVICES_OFFERED,
  PROVIDER_STATUSES,
  PROVIDER_STATUS_STYLES,
  CALL_OUTCOMES_REQUIRING_FOLLOW_UP,
  isProviderOverdue,
  overdueProviderDurationLabel,
  type LatestProviderLeadEmail,
  type ProviderActivityRow,
  type ProviderCallOutcome,
  type ProviderFollowUpRow,
  type ProviderLeadRow,
} from "@/lib/provider-types";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, toDatetimeLocal, type CrmUserRow } from "@/lib/crm-types";
import ProviderEmailStatusPanel from "@/components/ProviderEmailStatusPanel";
import SendProviderIntakeModal from "@/components/SendProviderIntakeModal";
import CopyIntakeLinkButton from "@/components/CopyIntakeLinkButton";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border,#d6dbe3)] bg-white px-3.5 py-2.5 text-[14.5px] text-slate-900";

export type ProviderDetailActions = {
  updateDetails: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  updateStatus: (providerId: string, status: string) => Promise<{ error?: string }>;
  addCallNote: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  addActivity: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  sendIntakeEmail: (providerId: string) => Promise<{ error?: string; email?: string }>;
  markIntakeFormCompleted: (providerId: string) => Promise<{ error?: string }>;
  markApprovedProvider: (providerId: string) => Promise<{ error?: string }>;
  markNotInterested: (providerId: string) => Promise<{ error?: string }>;
  closeProviderLead: (providerId: string) => Promise<{ error?: string }>;
  reopenProviderLead?: (providerId: string) => Promise<{ error?: string }>;
  deleteProviderLead: (providerId: string) => Promise<{ error?: string }>;
  assignAgent?: (providerId: string, agentId: string | null) => Promise<{ error?: string }>;
  scheduleFollowUp: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  rescheduleFollowUp: (
    followUpId: string,
    providerId: string,
    formData: FormData
  ) => Promise<{ error?: string } | void>;
  completeFollowUp: (followUpId: string, providerId: string) => Promise<{ error?: string } | void>;
  removeFollowUp?: (followUpId: string, providerId: string) => Promise<{ error?: string } | void>;
};

// Shared by both /agent/provider-acquisition/[id] and
// /admin/crm/provider-acquisition/[id] - every action is injected as a
// prop (same pattern as CloseLeadPanel) so this one component covers both
// roles' near-identical UI while each page's own Server Actions stay
// scoped to their own requireCrmUser()/requireCrmAdmin() + revalidatePath
// calls.
export default function ProviderDetailClient({
  provider,
  activities,
  followUps,
  latestEmail,
  justAdded,
  isAdmin,
  agents,
  actions,
  listPath,
}: {
  provider: ProviderLeadRow;
  activities: ProviderActivityRow[];
  followUps: ProviderFollowUpRow[];
  latestEmail: LatestProviderLeadEmail | null;
  justAdded: boolean;
  isAdmin: boolean;
  agents?: CrmUserRow[];
  actions: ProviderDetailActions;
  listPath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingCallNote, setAddingCallNote] = useState(false);
  const [callOutcome, setCallOutcome] = useState<ProviderCallOutcome | "">("");
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && "error" in result && result.error) setError(result.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const agentById = new Map((agents ?? []).map((a) => [a.id, a]));
  const assignedAgent = provider.assigned_agent_id ? agentById.get(provider.assigned_agent_id) : null;

  return (
    <div>
      {justAdded && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Provider lead saved.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900">{provider.business_name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {provider.contact_person ? `${provider.contact_person} · ` : ""}
            {provider.phone} · {provider.city}, {provider.province}
          </p>
          {isAdmin && (
            <p className="mt-1 text-sm text-slate-500">
              Assigned to: {assignedAgent?.full_name || assignedAgent?.email || "Unassigned"}
            </p>
          )}
        </div>
        <select
          value={provider.status}
          disabled={isPending}
          onChange={(e) => runAction(() => actions.updateStatus(provider.id, e.target.value))}
          className={`rounded-full border-none px-3.5 py-2 text-[13px] font-semibold ${PROVIDER_STATUS_STYLES[provider.status]}`}
        >
          {PROVIDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {isProviderOverdue(provider) && provider.next_follow_up_at && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Overdue — {overdueProviderDurationLabel(provider.next_follow_up_at)} (was due{" "}
          {new Date(provider.next_follow_up_at).toLocaleString()})
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {isAdmin && agents && actions.assignAgent && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">Assigned Agent:</span>
          <select
            value={provider.assigned_agent_id ?? ""}
            disabled={isPending}
            onChange={(e) => runAction(() => actions.assignAgent!(provider.id, e.target.value || null))}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name || a.email}
              </option>
            ))}
          </select>
        </div>
      )}

      <ProviderEmailStatusPanel latestEmail={latestEmail} />

      {/* Action buttons - brief section 4 */}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <ActionButton onClick={() => setEditing((v) => !v)}>{editing ? "Cancel Edit" : "Edit Provider"}</ActionButton>
        <ActionButton onClick={() => setAddingCallNote((v) => !v)}>
          {addingCallNote ? "Cancel Call Note" : "Add Call Note"}
        </ActionButton>
        <ActionButton
          primary
          disabled={!provider.email}
          onClick={() => {
            setSendSuccess(null);
            setShowSendModal(true);
          }}
        >
          Send Intake Form
        </ActionButton>
        <CopyIntakeLinkButton className="rounded-full border border-slate-300 px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 hover:border-slate-400" />
        <ActionButton onClick={() => setShowSchedule((v) => !v)}>
          {showSchedule ? "Cancel Follow-up" : "Schedule Follow-up"}
        </ActionButton>
        {provider.status !== "Intake Form Completed" && (
          <ActionButton
            disabled={isPending}
            onClick={() => runAction(() => actions.markIntakeFormCompleted(provider.id))}
          >
            Mark Intake Form Completed
          </ActionButton>
        )}
        {provider.status !== "Approved Provider" && (
          <ActionButton
            disabled={isPending}
            onClick={() => runAction(() => actions.markApprovedProvider(provider.id))}
          >
            Mark Approved Provider
          </ActionButton>
        )}
        {provider.status !== "Not Interested" && (
          <ActionButton
            disabled={isPending}
            onClick={() => runAction(() => actions.markNotInterested(provider.id))}
          >
            Mark Not Interested
          </ActionButton>
        )}
        {provider.status !== "Closed" ? (
          <ActionButton
            disabled={isPending}
            danger
            onClick={() => {
              if (confirm(`Close "${provider.business_name}"?`)) {
                runAction(() => actions.closeProviderLead(provider.id));
              }
            }}
          >
            Close Lead
          </ActionButton>
        ) : (
          isAdmin &&
          actions.reopenProviderLead && (
            <ActionButton disabled={isPending} onClick={() => runAction(() => actions.reopenProviderLead!(provider.id))}>
              Reopen Provider
            </ActionButton>
          )
        )}
        <ActionButton
          disabled={isPending}
          danger
          onClick={() => {
            if (!confirm(`Delete "${provider.business_name}"? This cannot be undone.`)) return;
            setError(null);
            startTransition(async () => {
              try {
                const result = await actions.deleteProviderLead(provider.id);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                router.push(listPath);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
              }
            });
          }}
        >
          Delete Lead
        </ActionButton>
      </div>
      {sendSuccess && (
        <p className="mt-2 text-[13px] font-medium text-emerald-700">Intake form email sent to {sendSuccess}.</p>
      )}

      {showSendModal && (
        <SendProviderIntakeModal
          provider={provider}
          isPending={isPending}
          sendAction={actions.sendIntakeEmail}
          onClose={() => setShowSendModal(false)}
          onSent={(email) => setSendSuccess(email)}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
            Provider Details
          </h2>

          {editing ? (
            <form
              action={(formData) => {
                runAction(() => actions.updateDetails(provider.id, formData));
                setEditing(false);
              }}
              className="mt-4 space-y-3"
            >
              <LabeledInput name="business_name" label="Business Name" defaultValue={provider.business_name} required />
              <LabeledInput name="contact_person" label="Contact Person" defaultValue={provider.contact_person ?? ""} />
              <LabeledInput name="phone" label="Phone Number" defaultValue={provider.phone} required />
              <LabeledInput name="email" label="Email Address" type="email" defaultValue={provider.email ?? ""} />
              <LabeledInput name="city" label="City" defaultValue={provider.city} required />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">
                  Province <span className="text-red-600">*</span>
                </span>
                <select name="province" required defaultValue={provider.province} className={inputClass}>
                  {CANADIAN_PROVINCES_AND_TERRITORIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <LabeledInput name="website" label="Website" type="url" defaultValue={provider.website ?? ""} />
              <LabeledInput
                name="years_in_business"
                label="Years in Business"
                defaultValue={provider.years_in_business ?? ""}
              />
              <LabeledInput name="lead_source" label="Lead Source" defaultValue={provider.lead_source ?? ""} />

              <div>
                <span className="text-[13px] font-semibold text-slate-600">Services Offered</span>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PROVIDER_SERVICES_OFFERED.map((service) => (
                    <label key={service} className="flex items-center gap-2 text-[13.5px]">
                      <input
                        type="checkbox"
                        name="services_offered"
                        value={service}
                        defaultChecked={provider.services_offered.includes(service)}
                      />
                      {service}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Notes</span>
                <textarea name="notes" defaultValue={provider.notes ?? ""} className={`${inputClass} min-h-[90px] resize-y`} />
              </label>

              <button
                type="submit"
                disabled={isPending}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700"
              >
                Save
              </button>
            </form>
          ) : (
            <dl className="mt-4 space-y-2.5 text-[14px]">
              <Row label="Email" value={provider.email} />
              <Row label="Website" value={provider.website} />
              <Row label="Services Offered" value={provider.services_offered.join(", ") || null} />
              <Row label="Years in Business" value={provider.years_in_business} />
              <Row label="Lead Source" value={provider.lead_source} />
              <Row label="Date Created" value={new Date(provider.created_at).toLocaleString()} />
              <Row label="Date Updated" value={new Date(provider.updated_at).toLocaleString()} />
              <Row
                label="Last Contact Date"
                value={provider.last_contacted_at ? new Date(provider.last_contacted_at).toLocaleString() : null}
              />
              <Row
                label="Next Follow-up Date"
                value={provider.next_follow_up_at ? new Date(provider.next_follow_up_at).toLocaleString() : null}
              />
              {provider.closed_at && (
                <Row label="Closed" value={new Date(provider.closed_at).toLocaleString()} />
              )}
              {provider.notes && (
                <div className="border-t border-slate-100 pt-2.5">
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-900">{provider.notes}</dd>
                </div>
              )}
            </dl>
          )}

          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                Scheduled Follow-ups
              </h3>
              <button type="button" onClick={() => setShowSchedule((v) => !v)} className="text-[13px] font-semibold text-sky-600">
                {showSchedule ? "Cancel" : "+ Schedule"}
              </button>
            </div>

            {showSchedule && (
              <form
                action={(formData) => {
                  runAction(() => actions.scheduleFollowUp(provider.id, formData));
                  setShowSchedule(false);
                }}
                className="mt-3 space-y-2"
              >
                <input type="datetime-local" name="scheduled_at" required className={inputClass} />
                <input name="note" placeholder="Short note (optional)" className={inputClass} />
                <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2 text-[13.5px] font-semibold text-white transition hover:bg-sky-700">
                  Schedule
                </button>
              </form>
            )}

            {followUps.length === 0 ? (
              <p className="mt-3 text-[13px] text-slate-500">No follow-ups scheduled for this provider.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {followUps.map((followUp) => (
                  <li key={followUp.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
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
                        onClick={() => runAction(() => actions.completeFollowUp(followUp.id, provider.id))}
                        className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        Mark Completed
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setReschedulingId(reschedulingId === followUp.id ? null : followUp.id)}
                        className="text-[12.5px] font-semibold text-sky-600"
                      >
                        Reschedule
                      </button>
                      {isAdmin && actions.removeFollowUp && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            if (confirm("Remove this scheduled follow-up?")) {
                              runAction(() => actions.removeFollowUp!(followUp.id, provider.id));
                            }
                          }}
                          className="text-[12.5px] font-semibold text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {reschedulingId === followUp.id && (
                      <form
                        action={(formData) => {
                          runAction(() => actions.rescheduleFollowUp(followUp.id, provider.id, formData));
                          setReschedulingId(null);
                        }}
                        className="mt-2 space-y-2"
                      >
                        <input
                          type="datetime-local"
                          name="scheduled_at"
                          required
                          defaultValue={toDatetimeLocal(followUp.scheduled_at)}
                          className={inputClass}
                        />
                        <input name="note" required placeholder="Reason for rescheduling (required)" className={inputClass} />
                        <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-sky-700">
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          {addingCallNote && (
            <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-800">Add Call Note</h2>
              <form
                action={(formData) => {
                  runAction(async () => {
                    const result = await actions.addCallNote(provider.id, formData);
                    if (!result?.error) {
                      setAddingCallNote(false);
                      setCallOutcome("");
                    }
                    return result;
                  });
                }}
                className="mt-3 space-y-3"
              >
                <select
                  name="call_outcome"
                  required
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value as ProviderCallOutcome)}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Select a call outcome…
                  </option>
                  {PROVIDER_CALL_OUTCOMES.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {outcome}
                    </option>
                  ))}
                </select>
                <textarea name="notes" placeholder="Notes" className={`${inputClass} min-h-[70px] resize-y`} />
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">
                    Next Follow-up Date
                    {callOutcome && CALL_OUTCOMES_REQUIRING_FOLLOW_UP.includes(callOutcome) && (
                      <span className="text-red-600"> * (required for &quot;Follow-up Requested&quot;)</span>
                    )}
                  </span>
                  <input type="datetime-local" name="next_follow_up_at" className={inputClass} />
                </label>
                <button type="submit" disabled={isPending} className="w-full rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700">
                  Save Call Note
                </button>
              </form>
            </div>
          )}

          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Log Activity</h2>
          <form
            action={(formData) => runAction(() => actions.addActivity(provider.id, formData))}
            className="mt-4 space-y-3"
          >
            <select name="activity_type" required className={inputClass} defaultValue="note">
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <textarea name="notes" placeholder="What happened?" className={`${inputClass} min-h-[70px] resize-y`} />
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Next Follow-up (optional)</span>
              <input type="datetime-local" name="next_follow_up_at" className={inputClass} />
            </label>
            <button type="submit" disabled={isPending} className="w-full rounded-full bg-slate-800 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-slate-700">
              Save Activity
            </button>
          </form>

          <h2 className="mt-6 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
            Activity History
          </h2>
          {activities.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No activity logged yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activities.map((activity) => (
                <li key={activity.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {ACTIVITY_TYPE_LABELS[activity.activity_type]}
                      {activity.call_outcome && ` — ${activity.call_outcome}`}
                    </span>
                    <span className="text-[12px] text-slate-500">
                      {new Date(activity.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  {activity.notes && <p className="mt-1 whitespace-pre-wrap text-slate-700">{activity.notes}</p>}
                  {activity.next_follow_up_at && (
                    <p className="mt-1 text-[12px] text-slate-500">
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

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const base = "rounded-full px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const style = primary
    ? "bg-emerald-600 text-white hover:bg-emerald-700"
    : danger
      ? "border border-rose-300 text-rose-700 hover:border-rose-400"
      : "border border-slate-300 text-slate-700 hover:border-slate-400";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function LabeledInput({
  name,
  label,
  type = "text",
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate-600">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required} className={inputClass} />
    </label>
  );
}
