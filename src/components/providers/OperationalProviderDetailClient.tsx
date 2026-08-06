"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CANADIAN_PROVINCES_AND_TERRITORIES,
  CLEANING_PROVIDER_STATUS_STYLES,
  PROVIDER_ACTIVITY_TYPE_LABELS,
  PROVIDER_SERVICES_OFFERED,
  type CleaningProviderRow,
  type LatestProviderLeadEmail,
  type ProviderActivityRow,
  type ProviderEmailHistoryRow,
  type ProviderFollowUpRow,
  type ProviderNoteRow,
  type ProviderScoreAdjustmentRow,
} from "@/lib/provider-types";
import { toDatetimeLocal, type CrmUserRow } from "@/lib/crm-types";
import type { ProviderQuoteHistoryRow } from "@/lib/provider-quote-history";
import ProviderEmailStatusPanel from "@/components/ProviderEmailStatusPanel";
import SendProviderEmailModal from "@/components/SendProviderEmailModal";
import SendProviderSmsModal from "@/components/SendProviderSmsModal";
import ProviderScorecardCard from "@/components/provider-acquisition/ProviderScorecardCard";
import ProviderQuoteHistoryCard from "@/components/provider-acquisition/ProviderQuoteHistoryCard";
import ProviderFilesCard, { type ProviderDocumentWithUrl } from "@/components/provider-acquisition/ProviderFilesCard";
import ProviderNotesCard from "@/components/provider-acquisition/ProviderNotesCard";
import ProviderEmailHistoryCard from "@/components/provider-acquisition/ProviderEmailHistoryCard";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border,#d6dbe3)] bg-white px-3.5 py-2.5 text-[14.5px] text-slate-900";

export type OperationalProviderDetailActions = {
  updateProfile: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  updateStatus?: (providerId: string, status: string) => Promise<{ error?: string }>;
  addActivity: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  sendEmail: (providerId: string, formData: FormData) => Promise<{ error?: string; email?: string }>;
  sendSms: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  assignAgent?: (providerId: string, agentId: string | null) => Promise<{ error?: string }>;
  scheduleFollowUp: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  rescheduleFollowUp: (
    followUpId: string,
    providerId: string,
    formData: FormData
  ) => Promise<{ error?: string } | void>;
  completeFollowUp: (followUpId: string, providerId: string) => Promise<{ error?: string } | void>;
  removeFollowUp?: (followUpId: string, providerId: string) => Promise<{ error?: string } | void>;
  addNote: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  updateNote: (noteId: string, providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  uploadDocument: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  removeDocument?: (documentId: string, providerId: string) => Promise<{ error?: string } | void>;
  addScoreAdjustment?: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  recalculateScore?: (providerId: string) => Promise<{ error?: string } | void>;
  updateScorecard?: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  deleteProvider?: (providerId: string) => Promise<{ error?: string } | void>;
};

// The permanent operational Provider Profile - built on cleaning_providers
// (the pre-existing quote-assignment directory), used everywhere a
// provider is opened: the Providers directory, an approved Provider
// Acquisition record, quote assignment, and quote history alike. Shared
// by /admin/providers/[id] and /agent/providers/[id]; every action is
// injected as a prop so this one component covers both roles.
export default function OperationalProviderDetailClient({
  provider,
  activities,
  followUps,
  notes,
  documents,
  scoreAdjustments,
  emailHistory,
  latestEmail,
  quoteHistory,
  logoUrl,
  linkedLead,
  isAdmin,
  currentUserId,
  agents,
  actions,
  listPath,
}: {
  provider: CleaningProviderRow;
  activities: ProviderActivityRow[];
  followUps: ProviderFollowUpRow[];
  notes: ProviderNoteRow[];
  documents: ProviderDocumentWithUrl[];
  scoreAdjustments: ProviderScoreAdjustmentRow[];
  emailHistory: ProviderEmailHistoryRow[];
  latestEmail: LatestProviderLeadEmail | null;
  quoteHistory: ProviderQuoteHistoryRow[];
  logoUrl: string | null;
  linkedLead: { id: string; business_name: string } | null;
  isAdmin: boolean;
  currentUserId: string;
  agents?: CrmUserRow[];
  actions: OperationalProviderDetailActions;
  listPath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
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
      {linkedLead && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Onboarded from Provider Acquisition —{" "}
          <Link
            href={`/${isAdmin ? "admin/crm" : "agent"}/provider-acquisition/${linkedLead.id}`}
            className="font-semibold text-sky-600"
          >
            view the original recruiting record
          </Link>
          .
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl border border-slate-200 object-contain bg-white" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-400">
              {provider.company_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-[22px] font-bold text-slate-900">{provider.company_name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {provider.contact_person ? `${provider.contact_person}${provider.job_title ? ` — ${provider.job_title}` : ""} · ` : ""}
              {[provider.phone, provider.city, provider.province].filter(Boolean).join(" · ")}
            </p>
            {isAdmin && (
              <p className="mt-1 text-sm text-slate-500">
                Assigned to: {assignedAgent?.full_name || assignedAgent?.email || "Unassigned"}
              </p>
            )}
          </div>
        </div>
        {actions.updateStatus ? (
          <select
            value={provider.status}
            disabled={isPending}
            onChange={(e) => runAction(() => actions.updateStatus!(provider.id, e.target.value))}
            className={`rounded-full border-none px-3.5 py-2 text-[13px] font-semibold ${CLEANING_PROVIDER_STATUS_STYLES[provider.status]}`}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        ) : (
          <span className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${CLEANING_PROVIDER_STATUS_STYLES[provider.status]}`}>
            {provider.status}
          </span>
        )}
      </div>

      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12.5px] text-slate-600">
        {isAdmin
          ? "Administrator access — full edit, status, and deletion rights on this profile."
          : "Agent access — you can manage this provider's profile, contact info, services, notes, communication, and documents. Changing the operational status, reassigning, or deleting requires an administrator."}
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
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

      <div className="mt-4">
        <ProviderScorecardCard
          provider={provider}
          score={provider.score}
          label={provider.score_label}
          breakdown={provider.score_breakdown}
          missingCategories={provider.score_missing_categories}
          isNewProvider={provider.score_is_new_provider}
          calculatedAt={provider.score_calculated_at}
          adjustments={scoreAdjustments}
          isAdmin={isAdmin}
          onAddAdjustment={
            actions.addScoreAdjustment ? (formData) => actions.addScoreAdjustment!(provider.id, formData) : undefined
          }
          onRecalculate={actions.recalculateScore ? () => actions.recalculateScore!(provider.id) : undefined}
          onUpdateScorecard={
            actions.updateScorecard ? (formData) => actions.updateScorecard!(provider.id, formData) : undefined
          }
        />
      </div>

      <ProviderEmailStatusPanel latestEmail={latestEmail} />

      <div className="mt-6 flex flex-wrap gap-2.5">
        <ActionButton onClick={() => setEditing((v) => !v)}>{editing ? "Cancel Edit" : "Edit Provider"}</ActionButton>
        <ActionButton
          disabled={!provider.email}
          onClick={() => {
            setSendSuccess(null);
            setShowEmailModal(true);
          }}
        >
          Send Email
        </ActionButton>
        <ActionButton
          disabled={!provider.phone}
          onClick={() => {
            setSendSuccess(null);
            setShowSmsModal(true);
          }}
        >
          Send SMS
        </ActionButton>
        <ActionButton onClick={() => setShowSchedule((v) => !v)}>
          {showSchedule ? "Cancel Follow-up" : "Schedule Follow-up"}
        </ActionButton>
        <ActionButton onClick={() => document.getElementById("files")?.scrollIntoView({ behavior: "smooth" })}>
          Upload Document
        </ActionButton>
        <ActionButton onClick={() => document.getElementById("quote-history")?.scrollIntoView({ behavior: "smooth" })}>
          View Quote History
        </ActionButton>
        {isAdmin && actions.deleteProvider && (
          <ActionButton
            disabled={isPending}
            danger
            onClick={() => {
              if (!confirm(`Delete "${provider.company_name}"? This cannot be undone.`)) return;
              setError(null);
              startTransition(async () => {
                try {
                  const result = await actions.deleteProvider!(provider.id);
                  if (result && "error" in result && result.error) {
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
            Delete Provider
          </ActionButton>
        )}
      </div>
      {sendSuccess && <p className="mt-2 text-[13px] font-medium text-emerald-700">{sendSuccess}</p>}

      {showEmailModal && (
        <SendProviderEmailModal
          providerEmail={provider.email}
          isPending={isPending}
          sendAction={(formData) => actions.sendEmail(provider.id, formData)}
          onClose={() => setShowEmailModal(false)}
          onSent={(email) => setSendSuccess(`Email sent to ${email}.`)}
        />
      )}
      {showSmsModal && provider.phone && (
        <SendProviderSmsModal
          providerPhone={provider.phone}
          isPending={isPending}
          sendAction={(formData) => actions.sendSms(provider.id, formData)}
          onClose={() => setShowSmsModal(false)}
          onSent={() => setSendSuccess(`SMS sent to ${provider.phone}.`)}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">General Information</h2>

          {editing ? (
            <form
              action={(formData) => {
                runAction(() => actions.updateProfile(provider.id, formData));
                setEditing(false);
              }}
              className="mt-4 space-y-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Company Logo (optional)</span>
                <input type="file" name="logo" accept="image/*" className="text-[13.5px]" />
              </label>
              <LabeledInput name="company_name" label="Business Name" defaultValue={provider.company_name} required />
              <LabeledInput name="contact_person" label="Contact Person" defaultValue={provider.contact_person ?? ""} />
              <LabeledInput name="job_title" label="Job Title" defaultValue={provider.job_title ?? ""} />
              <LabeledInput name="phone" label="Phone Number" defaultValue={provider.phone ?? ""} />
              <LabeledInput name="email" label="Email Address" type="email" defaultValue={provider.email ?? ""} />
              <LabeledInput name="website" label="Website" type="url" defaultValue={provider.website ?? ""} />
              <LabeledInput name="street_address" label="Business Address" defaultValue={provider.street_address ?? ""} />
              <LabeledInput name="city" label="City" defaultValue={provider.city ?? ""} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Province</span>
                <select name="province" defaultValue={provider.province ?? ""} className={inputClass}>
                  <option value="">—</option>
                  {CANADIAN_PROVINCES_AND_TERRITORIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <LabeledInput name="postal_code" label="Postal Code" defaultValue={provider.postal_code ?? ""} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Cities Served</span>
                <textarea
                  name="cities_served"
                  defaultValue={provider.cities_served.join(", ")}
                  placeholder="Comma-separated list of cities"
                  className={`${inputClass} min-h-[60px] resize-y`}
                />
              </label>
              <LabeledInput name="years_in_business" label="Years in Business" defaultValue={provider.years_in_business ?? ""} />
              <LabeledInput
                name="number_of_employees"
                label="Number of Employees (optional)"
                defaultValue={provider.number_of_employees ?? ""}
              />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Business Description</span>
                <textarea
                  name="business_description"
                  defaultValue={provider.business_description ?? ""}
                  className={`${inputClass} min-h-[70px] resize-y`}
                />
              </label>

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

              <label className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" name="wsib_wcb_applicable" value="true" defaultChecked={provider.wsib_wcb_applicable} />
                WSIB / WCB documentation applies to this provider
              </label>

              <LabeledInput name="service_locations" label="Service Locations (legacy free text)" defaultValue={provider.service_locations ?? ""} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Pricing Notes</span>
                <textarea name="pricing_notes" defaultValue={provider.pricing_notes ?? ""} className={`${inputClass} min-h-[70px] resize-y`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Internal Notes (legacy free text)</span>
                <textarea name="internal_notes" defaultValue={provider.internal_notes ?? ""} className={`${inputClass} min-h-[90px] resize-y`} />
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
              <Row label="Business Address" value={provider.street_address} />
              <Row label="Postal Code" value={provider.postal_code} />
              <Row label="Years in Business" value={provider.years_in_business} />
              <Row label="Number of Employees" value={provider.number_of_employees} />
              <Row label="Date Added" value={new Date(provider.created_at).toLocaleString()} />
              <Row
                label="Last Contact Date"
                value={provider.last_contacted_at ? new Date(provider.last_contacted_at).toLocaleString() : null}
              />
              <Row
                label="Next Follow-up Date"
                value={provider.next_follow_up_at ? new Date(provider.next_follow_up_at).toLocaleString() : null}
              />
              <Row label="Pricing Notes" value={provider.pricing_notes} />
              {provider.business_description && (
                <div className="border-t border-slate-100 pt-2.5">
                  <dt className="text-slate-500">Business Description</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-900">{provider.business_description}</dd>
                </div>
              )}
              {provider.internal_notes && (
                <div className="border-t border-slate-100 pt-2.5">
                  <dt className="text-slate-500">Internal Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-900">{provider.internal_notes}</dd>
                </div>
              )}
            </dl>
          )}

          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Services Offered</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {provider.services_offered.length === 0 ? (
                <p className="text-[13px] text-slate-500">No services selected.</p>
              ) : (
                provider.services_offered.map((service) => (
                  <span key={service} className="rounded-full bg-sky-100 px-2.5 py-1 text-[12px] font-semibold text-sky-800">
                    {service}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Service Area</h3>
            <p className="mt-2 text-[13.5px] text-slate-700">Province: {provider.province || "—"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {provider.cities_served.length === 0 ? (
                <p className="text-[13px] text-slate-500">No cities served on file.</p>
              ) : (
                provider.cities_served.map((city) => (
                  <span key={city} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">
                    {city}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Scheduled Follow-ups</h3>
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
                      <span className="font-medium text-slate-900">{new Date(followUp.scheduled_at).toLocaleString()}</span>
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
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Log Activity</h2>
          <form action={(formData) => runAction(() => actions.addActivity(provider.id, formData))} className="mt-4 space-y-3">
            <select name="activity_type" required className={inputClass} defaultValue="note">
              {(["call", "email", "text", "voicemail", "note", "outcome"] as const).map((type) => (
                <option key={type} value={type}>
                  {PROVIDER_ACTIVITY_TYPE_LABELS[type]}
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

          <h2 className="mt-6 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Activity Timeline</h2>
          {activities.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No activity logged yet.</p>
          ) : (
            <ul className="mt-3 max-h-[520px] space-y-3 overflow-y-auto">
              {activities.map((activity) => (
                <li key={activity.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {PROVIDER_ACTIVITY_TYPE_LABELS[activity.activity_type] ?? activity.activity_type}
                      {activity.call_outcome && ` — ${activity.call_outcome}`}
                    </span>
                    <span className="text-[12px] text-slate-500">{new Date(activity.occurred_at).toLocaleString()}</span>
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

      <div className="mt-6">
        <PerformanceMetricsCard quoteHistory={quoteHistory} />
      </div>

      <div className="mt-6">
        <ProviderQuoteHistoryCard quoteHistory={quoteHistory} cleaningProviderId={provider.id} cleaningProviders={[]} isAdmin={isAdmin} />
      </div>

      <div className="mt-6">
        <ProviderEmailHistoryCard emails={emailHistory} isAdmin={isAdmin} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProviderNotesCard
          notes={notes}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onAdd={(formData) => actions.addNote(provider.id, formData)}
          onUpdate={(noteId, formData) => actions.updateNote(noteId, provider.id, formData)}
        />

        <ProviderFilesCard
          documents={documents}
          isAdmin={isAdmin}
          onUpload={(formData) => actions.uploadDocument(provider.id, formData)}
          onRemove={actions.removeDocument ? (documentId) => actions.removeDocument!(documentId, provider.id) : undefined}
        />
      </div>
    </div>
  );
}

function PerformanceMetricsCard({ quoteHistory }: { quoteHistory: ProviderQuoteHistoryRow[] }) {
  const submitted = quoteHistory.filter((q) => q.finalStatus !== "Awaiting Provider Quote").length;
  const accepted = quoteHistory.filter((q) => q.accepted).length;
  const acceptanceRate = submitted > 0 ? Math.round((accepted / submitted) * 100) : null;
  const values = quoteHistory.filter((q) => q.quoteValue !== null).map((q) => q.quoteValue as number);
  const avgValue = values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
  const lastSubmitted = quoteHistory[0]?.quoteRequestDate ?? null;

  const stats: { label: string; value: string }[] = [
    { label: "Total Quote Opportunities", value: String(quoteHistory.length) },
    { label: "Quotes Submitted", value: String(submitted) },
    { label: "Quotes Accepted", value: String(accepted) },
    { label: "Acceptance Rate", value: acceptanceRate !== null ? `${acceptanceRate}%` : "No data yet" },
    { label: "Average Quote Value", value: avgValue !== null ? `$${avgValue.toLocaleString()}` : "No data yet" },
    { label: "Last Quote Submitted", value: lastSubmitted ? new Date(lastSubmitted).toLocaleDateString() : "No data yet" },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Provider Statistics</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{stat.label}</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{stat.value}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-slate-500">
        Average response time and active/completed jobs aren&apos;t tracked automatically yet.
      </p>
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const base = "rounded-full px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const style = danger ? "border border-rose-300 text-rose-700 hover:border-rose-400" : "border border-slate-300 text-slate-700 hover:border-slate-400";
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
