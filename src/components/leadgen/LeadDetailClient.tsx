"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LEADGEN_ACTIVITY_TYPE_LABELS,
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_BOOKING_BUTTON_LABEL,
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  leadgenEmailStatusAt,
  LEADGEN_LEAD_STATUSES,
  LEADGEN_LEAD_STATUS_STYLES,
  LEADGEN_MEETING_TYPES,
  LEADGEN_PROVINCES,
  renderLeadgenTemplate,
  leadgenBookingParagraph,
  leadgenBookingInviteSection,
  leadgenServicesInviteSection,
  resolveLeadgenEmailBranding,
  type LeadgenAppointmentRow,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenEmailRow,
  type LeadgenEmailTemplateRow,
  type LeadgenFollowUpRow,
  type LeadgenLeadActivityRow,
  type LeadgenLeadRow,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import ConsultationEmailModal, { type SendConsultationEmailResult } from "./ConsultationEmailModal";
import ConsultationInvitationModal from "./ConsultationInvitationModal";
import FollowUpPrompt from "./FollowUpPrompt";
import RefreshOnFocus from "./RefreshOnFocus";
import LeadgenEmailStatusPanel from "./LeadgenEmailStatusPanel";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export type LeadDetailActions = {
  updateLead: (leadId: string, formData: FormData) => Promise<{ error?: string } | void>;
  recordCallOutcome: (leadId: string, formData: FormData) => Promise<{ error?: string } | void>;
  scheduleFollowUp: (leadId: string, formData: FormData) => Promise<{ error?: string } | void>;
  completeFollowUp: (followUpId: string, leadId: string) => Promise<{ error?: string } | void>;
  bookAppointment: (formData: FormData) => Promise<{ error?: string } | void>;
  sendConsultationEmail: (leadId: string, formData: FormData) => Promise<SendConsultationEmailResult>;
  sendConsultationInvitation: (leadId: string, formData: FormData) => Promise<SendConsultationEmailResult>;
  sendConsultationFollowUp: (leadId: string, formData: FormData) => Promise<SendConsultationEmailResult>;
  resendEmail?: (emailId: string) => Promise<{ error?: string } | void>;
  assignAgent?: (leadId: string, agentId: string | null) => Promise<{ error?: string } | void>;
  clearBouncedEmail?: (email: string) => Promise<{ error?: string } | void>;
  deleteLead?: (leadId: string) => Promise<{ error?: string } | void>;
};

// Shared Lead Generation CRM lead profile - identical between
// /leadgen/admin/leads/[id] and /leadgen/agent/leads/[id]; every action
// is injected as a prop, and admin-only affordances (reassign, resend a
// failed email) simply don't render when their action prop is absent,
// same pattern as the cleaning CRM's OperationalProviderDetailClient.
export default function LeadDetailClient({
  lead,
  client,
  campaign,
  agents,
  assignedAgentName,
  currentUserName,
  currentUserId,
  activities,
  followUps,
  appointments,
  emails,
  consultationTemplate,
  consultationInvitationTemplate,
  consultationFollowUpTemplate,
  followUpTemplates,
  bookingLink,
  servicesInfoLink,
  bouncedEmails,
  isAdmin,
  actions,
  listPath,
}: {
  lead: LeadgenLeadRow;
  client: LeadgenClientRow;
  campaign: LeadgenCampaignRow | null;
  agents: LeadgenUserRow[];
  assignedAgentName: string | null;
  currentUserName: string;
  currentUserId: string;
  activities: LeadgenLeadActivityRow[];
  followUps: LeadgenFollowUpRow[];
  appointments: LeadgenAppointmentRow[];
  emails: LeadgenEmailRow[];
  consultationTemplate: LeadgenEmailTemplateRow | null;
  consultationInvitationTemplate: LeadgenEmailTemplateRow | null;
  consultationFollowUpTemplate: LeadgenEmailTemplateRow | null;
  followUpTemplates: LeadgenEmailTemplateRow[];
  // The client's (or campaign's) configured booking link - shared by all
  // three consultation email types now (the original "Send Consultation
  // Email", the invitation, and the follow-up).
  bookingLink: string | null;
  // The client's "learn more about our services" link - only the
  // invitation/follow-up templates' {{services_section}} use this; omitted
  // entirely from the rendered email when null (see
  // leadgenServicesInviteSection in lib/leadgen-types.ts).
  servicesInfoLink: string | null;
  // Lowercased addresses with an uncleared permanent bounce - used to
  // show a warning badge next to any matching email address on this
  // page (brief: "Show a visible warning beside the client's email
  // address when an email permanently bounces").
  bouncedEmails: string[];
  isAdmin: boolean;
  actions: LeadDetailActions;
  listPath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [isDeletingLead, setIsDeletingLead] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showConsultationModal, setShowConsultationModal] = useState(false);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [showInvitationFollowUpModal, setShowInvitationFollowUpModal] = useState(false);
  const [postSendFollowUp, setPostSendFollowUp] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && "error" in result && result.error) setError(result.error);
        else onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  async function handleDeleteLead() {
    if (!actions.deleteLead || isPending || isDeletingLead) return;
    if (!confirm("Are you sure you want to permanently delete this lead and all related test data? This action cannot be undone.")) {
      return;
    }

    setError(null);
    setIsDeletingLead(true);
    const result = await actions.deleteLead(lead.id);
    if (result && "error" in result && result.error) {
      setError(result.error);
      setIsDeletingLead(false);
      return;
    }

    router.replace(`${listPath}?deleted=1`);
  }

  const bouncedSet = new Set(bouncedEmails);
  const isBounced = (email: string | null | undefined) => !!email && bouncedSet.has(email.trim().toLowerCase());

  // Validated/fallback-resolved values (see resolveLeadgenEmailBranding
  // in lib/leadgen-types.ts) - guarantees a Brent's Essentials email
  // never renders with an empty client name or missing button even if
  // the database row were somehow blank at render time.
  const branding = resolveLeadgenEmailBranding(client, bookingLink, servicesInfoLink);

  const firstName = (lead.contact_name || lead.decision_maker_name || lead.business_name).split(" ")[0];
  const defaultSubject = consultationTemplate?.subject ?? "Your FREE 15-Minute AI Business Growth Consultation";
  const defaultBody = consultationTemplate
    ? renderLeadgenTemplate(consultationTemplate.body, {
        first_name: firstName,
        booking_paragraph: leadgenBookingParagraph(branding.bookingUrl),
      })
    : "";
  const bookingSection = leadgenBookingInviteSection(branding.bookingUrl, LEADGEN_BOOKING_BUTTON_LABEL);
  const servicesSection = leadgenServicesInviteSection(branding.servicesUrl, branding.clientName);
  // booking_paragraph is aliased to the same marker text as
  // booking_section: some saved templates use that placeholder name
  // (matching the original "Send Consultation Email" template) instead
  // of booking_section, and without this alias it renders as nothing,
  // silently dropping the booking button from wherever it was placed in
  // the template body.
  const invitationVars = { first_name: firstName, client_business_name: branding.clientName, booking_section: bookingSection, booking_paragraph: bookingSection, services_section: servicesSection };
  const invitationSubject = consultationInvitationTemplate?.subject ?? "Book Your Free 15-Minute Consultation";
  const invitationBody = consultationInvitationTemplate ? renderLeadgenTemplate(consultationInvitationTemplate.body, invitationVars) : "";

  const followUpVars = { first_name: firstName, client_business_name: branding.clientName, booking_section: bookingSection, booking_paragraph: bookingSection, services_section: servicesSection };
  const followUpSubject = consultationFollowUpTemplate?.subject ?? "Following Up: Your Free 15-Minute Consultation";
  const followUpBody = consultationFollowUpTemplate
    ? renderLeadgenTemplate(consultationFollowUpTemplate.body, followUpVars)
    : `Hi ${firstName},\n\nJust following up on your FREE 15-minute AI Business Growth Consultation invitation.\n\nUse the button below to choose a convenient time for your consultation:\n\n${bookingSection}\n\nWe look forward to speaking with you and helping your business grow.\n\nRegards,\n\nWinsalot Corp.`;
  const fallbackFollowUpTemplates = consultationFollowUpTemplate ? [consultationFollowUpTemplate] : [];
  const followUpTemplateRows = followUpTemplates.length > 0 ? followUpTemplates : fallbackFollowUpTemplates;
  const followUpTemplateOptions = followUpTemplateRows.map((template) => ({
    id: template.id,
    name: template.name,
    subject: renderLeadgenTemplate(template.subject, followUpVars),
    body: renderLeadgenTemplate(template.body, followUpVars),
  }));
  if (followUpTemplateOptions.length === 0) {
    followUpTemplateOptions.push({
      id: "__default_follow_up__",
      name: "Default Follow-Up Template",
      subject: followUpSubject,
      body: followUpBody,
    });
  }
  const latestEmail = emails[0] ?? null;

  return (
    <div>
      <RefreshOnFocus />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900">{lead.business_name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {client.name}
            {campaign ? ` · ${campaign.name}` : ""} · {[lead.city, lead.province].filter(Boolean).join(", ")}
          </p>
        </div>
        <span className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>{lead.status}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="font-medium text-slate-600">Assigned Agent:</span>
        {isAdmin && actions.assignAgent ? (
          <select
            value={lead.assigned_agent_id ?? ""}
            disabled={isPending}
            onChange={(e) => runAction(() => actions.assignAgent!(lead.id, e.target.value || null))}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-slate-700">{assignedAgentName ?? "Unassigned"}</span>
        )}
        <Link href={listPath} className="ml-auto text-[13px] font-semibold text-sky-600 hover:text-sky-700">
          ← Back to Leads
        </Link>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {successMessage && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMessage}</p>}

      <LeadgenEmailStatusPanel latestEmail={latestEmail} />

      <div className="mt-5 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => setShowConsultationModal(true)}
          className="rounded-full bg-emerald-600 px-5 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-emerald-700"
        >
          Send Consultation Email
        </button>
        <ActionButton onClick={() => setShowFollowUpForm((v) => !v)}>{showFollowUpForm ? "Cancel Follow-up" : "Schedule Follow-up"}</ActionButton>
        <ActionButton onClick={() => setShowAppointmentForm((v) => !v)}>{showAppointmentForm ? "Cancel" : "Book Appointment"}</ActionButton>
        <ActionButton onClick={() => setEditing((v) => !v)}>{editing ? "Cancel Edit" : "Edit Lead"}</ActionButton>
        {isAdmin && actions.deleteLead && (
          <button
            type="button"
            disabled={isPending || isDeletingLead}
            onClick={handleDeleteLead}
            className="rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeletingLead ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>

      {showConsultationModal && (
        <ConsultationEmailModal
          lead={lead}
          agentName={currentUserName}
          campaignName={campaign?.name ?? null}
          defaultSubject={defaultSubject}
          defaultBody={defaultBody}
          bookingUrl={branding.bookingUrl}
          onClose={() => setShowConsultationModal(false)}
          onSend={(formData) => actions.sendConsultationEmail(lead.id, formData)}
          onSent={() => {
            setShowConsultationModal(false);
            setSuccessMessage("Consultation email sent.");
            setPostSendFollowUp(true);
          }}
        />
      )}

      {showInvitationModal && (
        <ConsultationInvitationModal
          lead={lead}
          agentName={currentUserName}
          subject={invitationSubject}
          body={invitationBody}
          bookingUrl={branding.bookingUrl}
          servicesUrl={branding.servicesUrl}
          onClose={() => setShowInvitationModal(false)}
          onSend={(formData) => actions.sendConsultationInvitation(lead.id, formData)}
          onSent={() => {
            setShowInvitationModal(false);
            setSuccessMessage("Consultation invitation sent.");
            setPostSendFollowUp(true);
          }}
        />
      )}

      {showInvitationFollowUpModal && (
        <ConsultationEmailModal
          lead={lead}
          agentName={currentUserName}
          campaignName={campaign?.name ?? null}
          title="Send Follow-Up Email"
          defaultSubject={followUpSubject}
          defaultBody={followUpBody}
          bookingUrl={branding.bookingUrl}
          servicesUrl={branding.servicesUrl}
          templateOptions={followUpTemplateOptions}
          templateSelectLabel="Saved Follow-Up Template"
          onClose={() => setShowInvitationFollowUpModal(false)}
          onSend={(formData) => actions.sendConsultationFollowUp(lead.id, formData)}
          onSent={() => {
            setShowInvitationFollowUpModal(false);
            setSuccessMessage("Follow-up email sent.");
          }}
        />
      )}

      {postSendFollowUp && (
        <FollowUpPrompt
          onSchedule={(scheduledAtIso) => {
            const formData = new FormData();
            formData.set("scheduled_at", scheduledAtIso);
            formData.set("note", "Follow up after consultation email.");
            runAction(() => actions.scheduleFollowUp(lead.id, formData), () => setPostSendFollowUp(false));
          }}
          onSkip={() => setPostSendFollowUp(false)}
        />
      )}

      {showFollowUpForm && (
        <form
          action={(formData) => runAction(() => actions.scheduleFollowUp(lead.id, formData), () => setShowFollowUpForm(false))}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4"
        >
          <input type="datetime-local" name="scheduled_at" required className={`${inputClass} max-w-[220px]`} />
          <input name="note" placeholder="Note (optional)" className={`${inputClass} max-w-[240px]`} />
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
            Schedule
          </button>
        </form>
      )}

      {showAppointmentForm && (
        <BookAppointmentInlineForm
          lead={lead}
          client={client}
          campaign={campaign}
          agents={agents}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          isPending={isPending}
          onBook={(formData) => runAction(() => actions.bookAppointment(formData), () => setShowAppointmentForm(false))}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Lead Information</h2>
          {editing ? (
            <form
              action={(formData) => runAction(() => actions.updateLead(lead.id, formData), () => setEditing(false))}
              className="mt-4 space-y-3"
            >
              <LabeledInput name="business_name" label="Business Name" defaultValue={lead.business_name} required />
              <LabeledInput name="industry" label="Industry" defaultValue={lead.industry ?? ""} />
              <LabeledInput name="contact_name" label="Contact Name" defaultValue={lead.contact_name ?? ""} />
              <LabeledInput name="decision_maker_name" label="Owner / Decision-Maker" defaultValue={lead.decision_maker_name ?? ""} />
              <LabeledInput name="phone" label="Phone Number" defaultValue={lead.phone ?? ""} />
              <LabeledInput name="email" label="Email" type="email" defaultValue={lead.email ?? ""} />
              <LabeledInput name="website" label="Website" defaultValue={lead.website ?? ""} />
              <LabeledInput name="city" label="City" defaultValue={lead.city ?? ""} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Province</span>
                <select name="province" defaultValue={lead.province ?? ""} className={inputClass}>
                  <option value="">—</option>
                  {LEADGEN_PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <LabeledInput name="lead_source" label="Lead Source" defaultValue={lead.lead_source ?? ""} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Notes</span>
                <textarea name="notes" defaultValue={lead.notes ?? ""} className={`${inputClass} min-h-[70px] resize-y`} />
              </label>
              <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700">
                Save
              </button>
            </form>
          ) : (
            <dl className="mt-4 space-y-2.5 text-[14px]">
              <Row label="Industry" value={lead.industry} />
              <Row label="Contact" value={lead.contact_name} />
              <Row label="Owner / Decision-Maker" value={lead.decision_maker_name} />
              <Row label="Phone" value={lead.phone} />
              {lead.email && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {lead.email}
                    {isBounced(lead.email) && (
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">⚠ Bounced</span>
                        {isAdmin && actions.clearBouncedEmail && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => runAction(() => actions.clearBouncedEmail!(lead.email!))}
                            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
                          >
                            Clear &amp; Approve
                          </button>
                        )}
                      </div>
                    )}
                  </dd>
                </div>
              )}
              <Row label="Website" value={lead.website} />
              <Row label="Lead Source" value={lead.lead_source} />
              <Row label="Date Added" value={new Date(lead.created_at).toLocaleString()} />
              <Row label="Last Contacted" value={lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleString() : null} />
              <Row label="Next Follow-up" value={lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : null} />
              {lead.notes && (
                <div className="border-t border-slate-100 pt-2.5">
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-900">{lead.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Record Call Outcome</h2>
          <form action={(formData) => runAction(() => actions.recordCallOutcome(lead.id, formData))} className="mt-4 space-y-3">
            <select name="call_outcome" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select an outcome…
              </option>
              {LEADGEN_LEAD_STATUSES.filter((s) => s !== "Consultation Information Sent").map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <textarea name="notes" placeholder="What happened on the call?" className={`${inputClass} min-h-[60px] resize-y`} />
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Next Follow-up (optional)</span>
              <input type="datetime-local" name="next_follow_up_at" className={inputClass} />
            </label>
            <button type="submit" disabled={isPending} className="w-full rounded-full bg-slate-800 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-slate-700">
              Save Call Outcome
            </button>
          </form>

          <h3 className="mt-6 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Activity Timeline</h3>
          {activities.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No activity logged yet.</p>
          ) : (
            <ul className="mt-3 max-h-[420px] space-y-3 overflow-y-auto">
              {activities.map((activity) => (
                <li key={activity.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {LEADGEN_ACTIVITY_TYPE_LABELS[activity.activity_type]}
                      {activity.call_outcome && ` — ${activity.call_outcome}`}
                    </span>
                    <span className="text-[12px] text-slate-500">{new Date(activity.occurred_at).toLocaleString()}</span>
                  </div>
                  {activity.notes && <p className="mt-1 whitespace-pre-wrap text-slate-700">{activity.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Follow-ups</h2>
          {followUps.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No follow-ups scheduled.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {followUps.map((followUp) => (
                <li key={followUp.id} className={`rounded-lg border px-3.5 py-3 text-[13.5px] ${followUp.status === "completed" ? "border-slate-100 bg-slate-50" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{new Date(followUp.scheduled_at).toLocaleString()}</span>
                    {followUp.status === "completed" && <span className="text-[11px] font-semibold text-emerald-700">Completed</span>}
                  </div>
                  {followUp.note && <p className="mt-1 text-slate-700">{followUp.note}</p>}
                  {followUp.status === "pending" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(() => actions.completeFollowUp(followUp.id, lead.id))}
                      className="mt-2 text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Mark Completed
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Appointments</h2>
          {appointments.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No appointments booked for this lead yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {appointments.map((appt) => (
                <li key={appt.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">
                      {appt.appointment_date} {appt.appointment_time} ({appt.timezone})
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>{appt.status}</span>
                  </div>
                  <p className="mt-1 text-slate-600">{appt.meeting_type}{appt.meeting_link ? ` · ${appt.meeting_link}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Communications / Email History</h2>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setShowInvitationModal(true)}
                className="rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
              >
                Send 15-Minute Consultation Invitation
              </button>
              <button
                type="button"
                onClick={() => setShowInvitationFollowUpModal(true)}
                className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-400"
              >
                Send Follow-Up Email
              </button>
            </div>
          </div>
          {emails.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No emails sent to this prospect yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Recipient</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Template</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Last Updated</th>
                    {isAdmin && actions.resendEmail && <th className="py-2 pr-3">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {emails.map((email) => {
                    const reason = email.status === "bounced" ? email.bounce_reason : email.status === "failed" ? email.failure_reason : null;
                    return (
                      <tr key={email.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 text-slate-600">{new Date(email.created_at).toLocaleString()}</td>
                        <td className="py-2 pr-3">
                          {email.to_email}
                          {isBounced(email.to_email) && <span className="ml-1.5 text-[11px] font-semibold text-rose-600">⚠</span>}
                        </td>
                        <td className="py-2 pr-3 max-w-[200px] truncate">{email.subject}</td>
                        <td className="py-2 pr-3 text-slate-500">{email.template_key ?? "—"}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[email.status]}`}>
                            {LEADGEN_EMAIL_STATUS_LABELS[email.status]}
                          </span>
                          {reason && <div className="mt-1 max-w-[220px] text-[11px] text-slate-500">{reason}</div>}
                        </td>
                        <td className="py-2 pr-3 text-slate-500">{new Date(leadgenEmailStatusAt(email)).toLocaleString()}</td>
                        {isAdmin && actions.resendEmail && (
                          <td className="py-2 pr-3">
                            {(email.status === "failed" || email.status === "bounced") && (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => runAction(() => actions.resendEmail!(email.id))}
                                className="text-[12px] font-semibold text-sky-600 hover:text-sky-700"
                              >
                                Resend
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BookAppointmentInlineForm({
  lead,
  client,
  campaign,
  agents,
  currentUserId,
  isAdmin,
  isPending,
  onBook,
}: {
  lead: LeadgenLeadRow;
  client: LeadgenClientRow;
  campaign: LeadgenCampaignRow | null;
  agents: LeadgenUserRow[];
  currentUserId: string;
  isAdmin: boolean;
  isPending: boolean;
  onBook: (formData: FormData) => void;
}) {
  return (
    <form action={onBook} className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <input type="hidden" name="lead_id" value={lead.id} />
      <input type="hidden" name="client_id" value={client.id} />
      {campaign && <input type="hidden" name="campaign_id" value={campaign.id} />}
      <input type="hidden" name="business_name" value={lead.business_name} />
      <input type="hidden" name="contact_name" value={lead.contact_name ?? ""} />
      <input type="hidden" name="phone" value={lead.phone ?? ""} />
      <input type="hidden" name="email" value={lead.email ?? ""} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Appointment Date</span>
        <input name="appointment_date" type="date" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Appointment Time</span>
        <input name="appointment_time" type="time" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Time Zone</span>
        <input name="timezone" defaultValue="America/Toronto" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Meeting Type</span>
        <select name="meeting_type" defaultValue="Phone Call" className={inputClass}>
          {LEADGEN_MEETING_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Meeting Link (optional)</span>
        <input name="meeting_link" type="url" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Assigned Specialist</span>
        {isAdmin && agents.length > 0 ? (
          <select name="assigned_specialist_id" defaultValue={currentUserId} className={inputClass}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="assigned_specialist_id" value={currentUserId} />
        )}
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-[13px] font-semibold text-slate-600">Internal Appointment Notes</span>
        <textarea name="appointment_notes" className={`${inputClass} min-h-[50px] resize-y`} />
      </label>
      <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2">
        <input type="hidden" name="notify_client" value="false" />
        <input
          type="checkbox"
          onChange={(e) => {
            const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
            hidden.value = e.currentTarget.checked ? "true" : "false";
          }}
          defaultChecked
        />
        Email the client a notification now
      </label>
      <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700 sm:col-span-2 sm:w-fit">
        {isPending ? "Booking…" : "Book Appointment"}
      </button>
    </form>
  );
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-400"
    >
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
