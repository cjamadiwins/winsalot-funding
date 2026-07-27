"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ADMIN_ONLY_STATUSES,
  CANADIAN_PROVINCES_AND_TERRITORIES,
  PROVIDER_ACTIVITY_TYPE_LABELS,
  PROVIDER_CALL_OUTCOMES,
  PROVIDER_SCORE_RATING_STYLES,
  PROVIDER_SERVICES_OFFERED,
  PROVIDER_STATUSES,
  PROVIDER_STATUS_STYLES,
  CALL_OUTCOMES_REQUIRING_FOLLOW_UP,
  isProviderOverdue,
  overdueProviderDurationLabel,
  type LatestProviderLeadEmail,
  type ProviderActivityRow,
  type ProviderCallOutcome,
  type ProviderEmailHistoryRow,
  type ProviderFollowUpRow,
  type ProviderIntakeVersionRow,
  type ProviderLeadRow,
  type ProviderNoteRow,
  type ProviderScoreAdjustmentRow,
} from "@/lib/provider-types";
import { toDatetimeLocal, type CrmUserRow } from "@/lib/crm-types";
import type { ProviderQuoteHistoryRow } from "@/lib/provider-quote-history";
import ProviderEmailStatusPanel from "@/components/ProviderEmailStatusPanel";
import SendProviderIntakeModal from "@/components/SendProviderIntakeModal";
import SendProviderEmailModal from "@/components/SendProviderEmailModal";
import SendProviderSmsModal from "@/components/SendProviderSmsModal";
import CopyIntakeLinkButton from "@/components/CopyIntakeLinkButton";
import ProviderScorecardCard from "./ProviderScorecardCard";
import ProviderQuoteHistoryCard from "./ProviderQuoteHistoryCard";
import ProviderFilesCard, { type ProviderDocumentWithUrl } from "./ProviderFilesCard";
import ProviderNotesCard from "./ProviderNotesCard";
import ProviderIntakeFormCard from "./ProviderIntakeFormCard";
import ProviderEmailHistoryCard from "./ProviderEmailHistoryCard";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border,#d6dbe3)] bg-white px-3.5 py-2.5 text-[14.5px] text-slate-900";

export type ProviderDetailActions = {
  updateProfile: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  updateStatus: (providerId: string, status: string) => Promise<{ error?: string }>;
  addCallNote: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  addActivity: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  sendIntakeEmail: (providerId: string) => Promise<{ error?: string; email?: string }>;
  sendEmail: (providerId: string, formData: FormData) => Promise<{ error?: string; email?: string }>;
  sendSms: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  markIntakeFormCompleted: (providerId: string) => Promise<{ error?: string }>;
  markApprovedProvider?: (providerId: string) => Promise<{ error?: string }>;
  markNotInterested: (providerId: string) => Promise<{ error?: string }>;
  markSuspended?: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  markDeclined?: (providerId: string, formData: FormData) => Promise<{ error?: string }>;
  flagForReview?: (providerId: string, reason: string) => Promise<{ error?: string }>;
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
  addNote: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  updateNote: (noteId: string, providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  uploadDocument: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  removeDocument?: (documentId: string, providerId: string) => Promise<{ error?: string } | void>;
  addScoreAdjustment?: (providerId: string, formData: FormData) => Promise<{ error?: string } | void>;
  recalculateScore?: (providerId: string) => Promise<{ error?: string } | void>;
  linkCleaningProvider?: (providerId: string, cleaningProviderId: string | null) => Promise<{ error?: string } | void>;
};

// Provider Profile - the central page for a cleaning provider, opened
// whenever an administrator or agent clicks a provider's business name.
// Shared by both /agent/provider-acquisition/[id] and
// /admin/crm/provider-acquisition/[id]; every action is injected as a
// prop so this one component covers both roles' UI while each page's own
// Server Actions stay scoped to their own requireCrmUser()/
// requireCrmAdmin() + RLS.
export default function ProviderDetailClient({
  provider,
  activities,
  followUps,
  latestEmail,
  emailHistory,
  notes,
  documents,
  scoreAdjustments,
  intakeVersions,
  quoteHistory,
  cleaningProviders,
  logoUrl,
  justAdded,
  isAdmin,
  currentUserId,
  agents,
  actions,
  listPath,
}: {
  provider: ProviderLeadRow;
  activities: ProviderActivityRow[];
  followUps: ProviderFollowUpRow[];
  latestEmail: LatestProviderLeadEmail | null;
  emailHistory: ProviderEmailHistoryRow[];
  notes: ProviderNoteRow[];
  documents: ProviderDocumentWithUrl[];
  scoreAdjustments: ProviderScoreAdjustmentRow[];
  intakeVersions: ProviderIntakeVersionRow[];
  quoteHistory: ProviderQuoteHistoryRow[];
  cleaningProviders: { id: string; company_name: string }[];
  logoUrl: string | null;
  justAdded: boolean;
  isAdmin: boolean;
  currentUserId: string;
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
  const ratingStyle = provider.score_label
    ? PROVIDER_SCORE_RATING_STYLES[provider.score_label as keyof typeof PROVIDER_SCORE_RATING_STYLES]
    : undefined;

  const visibleStatuses = PROVIDER_STATUSES.filter(
    (s) => isAdmin || !ADMIN_ONLY_STATUSES.includes(s) || s === provider.status
  );

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div>
      {justAdded && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Provider lead saved.
        </div>
      )}

      {/* Header - business name, logo, status badge, permission indicator */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl border border-slate-200 object-contain bg-white" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-400">
              {provider.business_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-[22px] font-bold text-slate-900">{provider.business_name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {provider.contact_person ? `${provider.contact_person}${provider.job_title ? ` — ${provider.job_title}` : ""} · ` : ""}
              {provider.phone} · {provider.city}, {provider.province}
            </p>
            {isAdmin && (
              <p className="mt-1 text-sm text-slate-500">
                Assigned to: {assignedAgent?.full_name || assignedAgent?.email || "Unassigned"}
              </p>
            )}
          </div>
        </div>
        <select
          value={provider.status}
          disabled={isPending}
          onChange={(e) => runAction(() => actions.updateStatus(provider.id, e.target.value))}
          className={`rounded-full border-none px-3.5 py-2 text-[13px] font-semibold ${PROVIDER_STATUS_STYLES[provider.status]}`}
        >
          {visibleStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12.5px] text-slate-600">
        {isAdmin
          ? "Administrator access — full edit, approval, and deletion rights on this profile."
          : "Agent access — you can manage this provider's profile, but approving, suspending, declining, reassigning, or deleting requires an administrator."}
      </p>

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

      {provider.score !== null && (
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => scrollTo("scorecard")} className="flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-900">{provider.score}</span>
            {provider.score_label && (
              <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${ratingStyle}`}>
                {provider.score_label}
              </span>
            )}
            <span className="text-[12.5px] font-semibold text-sky-600">View Scorecard →</span>
          </button>
        </div>
      )}

      <ProviderEmailStatusPanel latestEmail={latestEmail} />

      {/* Quick Actions (brief "QUICK ACTIONS") */}
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
        <ActionButton onClick={() => scrollTo("files")}>Upload Document</ActionButton>
        <ActionButton onClick={() => scrollTo("quote-history")}>View Quote History</ActionButton>
        {provider.status !== "Intake Form Completed" && (
          <ActionButton
            disabled={isPending}
            onClick={() => runAction(() => actions.markIntakeFormCompleted(provider.id))}
          >
            Mark Intake Form Completed
          </ActionButton>
        )}
        {isAdmin && actions.markApprovedProvider && provider.status !== "Approved Provider" && (
          <ActionButton
            disabled={isPending}
            onClick={() => runAction(() => actions.markApprovedProvider!(provider.id))}
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
        {isAdmin && actions.markSuspended && provider.status !== "Suspended" && (
          <ActionButton
            danger
            disabled={isPending}
            onClick={() => {
              const reason = window.prompt("Reason for suspending this provider:");
              if (reason === null) return;
              const fd = new FormData();
              fd.set("reason", reason);
              runAction(() => actions.markSuspended!(provider.id, fd));
            }}
          >
            Suspend Provider
          </ActionButton>
        )}
        {isAdmin && actions.markDeclined && provider.status !== "Declined" && (
          <ActionButton
            danger
            disabled={isPending}
            onClick={() => {
              const reason = window.prompt("Reason for declining this provider:");
              if (reason === null) return;
              const fd = new FormData();
              fd.set("reason", reason);
              runAction(() => actions.markDeclined!(provider.id, fd));
            }}
          >
            Decline Provider
          </ActionButton>
        )}
        {!isAdmin && actions.flagForReview && (
          <ActionButton
            disabled={isPending}
            onClick={() => {
              const reason = window.prompt("Why should an administrator review this provider?");
              if (!reason) return;
              runAction(() => actions.flagForReview!(provider.id, reason));
            }}
          >
            Flag for Admin Review
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
        {isAdmin && (
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
            Delete Provider
          </ActionButton>
        )}
      </div>
      {sendSuccess && (
        <p className="mt-2 text-[13px] font-medium text-emerald-700">{sendSuccess}</p>
      )}

      {showSendModal && (
        <SendProviderIntakeModal
          provider={provider}
          isPending={isPending}
          sendAction={actions.sendIntakeEmail}
          onClose={() => setShowSendModal(false)}
          onSent={(email) => setSendSuccess(`Intake form email sent to ${email}.`)}
        />
      )}
      {showEmailModal && (
        <SendProviderEmailModal
          providerEmail={provider.email}
          isPending={isPending}
          sendAction={(formData) => actions.sendEmail(provider.id, formData)}
          onClose={() => setShowEmailModal(false)}
          onSent={(email) => setSendSuccess(`Email sent to ${email}.`)}
        />
      )}
      {showSmsModal && (
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
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
            General Information
          </h2>

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
              <LabeledInput name="business_name" label="Business Name" defaultValue={provider.business_name} required />
              <LabeledInput name="contact_person" label="Contact Person" defaultValue={provider.contact_person ?? ""} />
              <LabeledInput name="job_title" label="Job Title" defaultValue={provider.job_title ?? ""} />
              <LabeledInput name="phone" label="Phone Number" defaultValue={provider.phone} required />
              <LabeledInput name="email" label="Email Address" type="email" defaultValue={provider.email ?? ""} />
              <LabeledInput name="website" label="Website" type="url" defaultValue={provider.website ?? ""} />
              <LabeledInput name="street_address" label="Business Address" defaultValue={provider.street_address ?? ""} />
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
              <LabeledInput
                name="years_in_business"
                label="Years in Business"
                defaultValue={provider.years_in_business ?? ""}
              />
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

              <label className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" name="wsib_wcb_applicable" value="true" defaultChecked={provider.wsib_wcb_applicable} />
                WSIB / WCB documentation applies to this provider
              </label>

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
              <Row label="Business Address" value={provider.street_address} />
              <Row label="Postal Code" value={provider.postal_code} />
              <Row label="Years in Business" value={provider.years_in_business} />
              <Row label="Number of Employees" value={provider.number_of_employees} />
              <Row label="Lead Source" value={provider.lead_source} />
              <Row label="Date Added" value={new Date(provider.created_at).toLocaleString()} />
              <Row label="Last Updated" value={new Date(provider.updated_at).toLocaleString()} />
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
              {provider.business_description && (
                <div className="border-t border-slate-100 pt-2.5">
                  <dt className="text-slate-500">Business Description</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-900">{provider.business_description}</dd>
                </div>
              )}
              {provider.notes && (
                <div className="border-t border-slate-100 pt-2.5">
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-900">{provider.notes}</dd>
                </div>
              )}
            </dl>
          )}

          {/* Services (brief "SERVICE INFORMATION") */}
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

          {/* Service Area (brief "SERVICE AREA") */}
          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Service Area</h3>
            <p className="mt-2 text-[13.5px] text-slate-700">Province: {provider.province}</p>
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

          <h2 className="mt-6 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
            Activity Timeline
          </h2>
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

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProviderScorecardCard
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
        />

        <PerformanceMetricsCard quoteHistory={quoteHistory} lastEmail={latestEmail} />
      </div>

      <div className="mt-6">
        <ProviderQuoteHistoryCard
          quoteHistory={quoteHistory}
          cleaningProviderId={provider.cleaning_provider_id}
          cleaningProviders={cleaningProviders}
          isAdmin={isAdmin}
          onLink={
            actions.linkCleaningProvider
              ? (cleaningProviderId) => actions.linkCleaningProvider!(provider.id, cleaningProviderId)
              : undefined
          }
        />
      </div>

      <div className="mt-6">
        <ProviderIntakeFormCard
          submission={provider.intake_submission}
          completedAt={provider.intake_completed_at}
          versions={intakeVersions}
        />
      </div>

      <div className="mt-6">
        <ProviderEmailHistoryCard
          emails={emailHistory}
          isAdmin={isAdmin}
          onResendIntake={() => actions.sendIntakeEmail(provider.id)}
        />
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

function PerformanceMetricsCard({
  quoteHistory,
  lastEmail,
}: {
  quoteHistory: ProviderQuoteHistoryRow[];
  lastEmail: LatestProviderLeadEmail | null;
}) {
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
      {lastEmail && (
        <p className="mt-3 text-[12px] text-slate-500">
          Average response time and active/completed jobs aren&apos;t tracked automatically yet — visible above once
          available.
        </p>
      )}
    </section>
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
