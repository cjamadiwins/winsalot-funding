"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Users, UserCheck, CalendarCheck, Clock, AlertTriangle, UserPlus, CalendarPlus, BarChart3 } from "lucide-react";
import {
  LEADGEN_BOOKING_BUTTON_LABEL,
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  LEADGEN_LEAD_ONLY_TEMPLATE_KEYS,
  LEADGEN_STAT_CARD_STYLES,
  leadgenBookingInviteSection,
  leadgenEmailStatusAt,
  leadgenServicesInviteSection,
  renderLeadgenTemplate,
  resolveLeadgenEmailBranding,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenEmailRow,
  type LeadgenEmailTemplateRow,
} from "@/lib/leadgen-types";
import { clearBouncedEmailAction, updateClientAction, createCampaignAction, resendLeadgenEmailAction } from "../../actions";
import { sendClientCommunicationAction } from "./actions";
import RefreshOnFocus from "@/components/leadgen/RefreshOnFocus";
import KpiCard from "@/components/crm-ui/KpiCard";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export default function ClientDetailClient({
  client,
  campaigns,
  emails,
  templates,
  leadCountByCampaign,
  appointmentCountByCampaign,
  totalLeads,
  interestedLeads,
  appointmentsBooked,
  followUpsDueToday,
  overdueFollowUps,
  bouncedEmails,
}: {
  client: LeadgenClientRow;
  campaigns: LeadgenCampaignRow[];
  emails: LeadgenEmailRow[];
  templates: LeadgenEmailTemplateRow[];
  leadCountByCampaign: Record<string, number>;
  appointmentCountByCampaign: Record<string, number>;
  totalLeads: number;
  interestedLeads: number;
  appointmentsBooked: number;
  followUpsDueToday: number;
  overdueFollowUps: number;
  bouncedEmails: string[];
}) {
  const bouncedSet = new Set(bouncedEmails);
  const isBounced = (email: string | null | undefined) => !!email && bouncedSet.has(email.trim().toLowerCase());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showComposer, setShowComposer] = useState(false);

  function runAction(fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  return (
    <div>
      <RefreshOnFocus />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
        <p className="text-[13.5px] font-semibold text-sky-800">Viewing {client.name}</p>
        <Link href="/leadgen/admin/clients" className="text-[13px] font-semibold text-sky-700 hover:text-sky-900">
          ← Back to All Clients
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            /{client.slug} · {totalLeads} lead{totalLeads === 1 ? "" : "s"} · {campaigns.length} campaign
            {campaigns.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href={`/leadgen/admin/clients/${client.id}/reports`}
            className="flex items-center gap-2 rounded-[11px] border-[1.5px] border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[13.5px] font-bold text-indigo-700 transition hover:bg-indigo-100"
          >
            <BarChart3 className="h-4 w-4" strokeWidth={2.3} />
            Client Report
          </Link>
          <Link
            href={`/leadgen/admin/leads?client=${client.id}&openAdd=1`}
            className="flex items-center gap-2 rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)]"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2.3} />
            Add Lead
          </Link>
          <Link
            href={`/leadgen/admin/appointments?client=${client.id}&openAdd=1`}
            className="flex items-center gap-2 rounded-[11px] border-[1.5px] border-[var(--crm-accent,#3e7ef7)]/30 bg-white px-4 py-2.5 text-[13.5px] font-bold text-[var(--crm-accent,#3e7ef7)] transition hover:bg-[var(--crm-bg-2,#eaf0f6)]"
          >
            <CalendarPlus className="h-4 w-4" strokeWidth={2.3} />
            Book Appointment
          </Link>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total Leads"
          value={String(totalLeads)}
          href={`/leadgen/admin/leads?client=${client.id}`}
          tone={LEADGEN_STAT_CARD_STYLES.leads}
          icon={<Users />}
        />
        <KpiCard
          label="Interested Leads"
          value={String(interestedLeads)}
          href={`/leadgen/admin/leads?client=${client.id}&status=${encodeURIComponent("Interested")}`}
          tone={LEADGEN_STAT_CARD_STYLES.interested}
          icon={<UserCheck />}
        />
        <KpiCard
          label="Appointments Booked"
          value={String(appointmentsBooked)}
          href={`/leadgen/admin/appointments?client=${client.id}`}
          tone={LEADGEN_STAT_CARD_STYLES.appointments}
          icon={<CalendarCheck />}
        />
        <KpiCard
          label="Follow-ups Due Today"
          value={String(followUpsDueToday)}
          href={`/leadgen/admin/leads?client=${client.id}&followup=due_today`}
          tone={LEADGEN_STAT_CARD_STYLES.dueToday}
          icon={<Clock />}
        />
        <KpiCard
          label="Overdue Follow-ups"
          value={String(overdueFollowUps)}
          href={`/leadgen/admin/leads?client=${client.id}&followup=overdue`}
          tone={LEADGEN_STAT_CARD_STYLES.overdue}
          icon={<AlertTriangle />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Client Information</h2>
            <button type="button" onClick={() => setEditingClient((v) => !v)} className="text-[12.5px] font-semibold text-sky-600">
              {editingClient ? "Cancel" : "Edit"}
            </button>
          </div>

          {editingClient ? (
            <form
              action={(formData) => {
                runAction(() => updateClientAction(client.id, formData), () => setEditingClient(false));
              }}
              className="mt-4 space-y-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Client Name</span>
                <input name="name" required defaultValue={client.name} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">URL Slug</span>
                <input name="slug" required defaultValue={client.slug} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Contact Name</span>
                <input name="contact_name" defaultValue={client.contact_name ?? ""} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Contact Email</span>
                <input name="contact_email" type="email" defaultValue={client.contact_email ?? ""} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Contact Phone</span>
                <input name="contact_phone" defaultValue={client.contact_phone ?? ""} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Consultation Booking Link</span>
                <input name="booking_link" type="url" placeholder="https://calendly.com/…" defaultValue={client.booking_link ?? ""} className={inputClass} />
                <span className="text-[12px] text-slate-500">
                  The &ldquo;Book a Free 15-Minute Consultation&rdquo; button in every consultation email opens this link directly (e.g. a
                  Calendly page) in a new tab. Leave blank to have those emails ask the prospect to reply instead of showing a broken link.
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Services Information Link</span>
                <input
                  name="services_info_link"
                  type="url"
                  placeholder="https://…"
                  defaultValue={client.services_info_link ?? ""}
                  className={inputClass}
                />
                <span className="text-[12px] text-slate-500">
                  Optional second button (&ldquo;LEARN MORE ABOUT {client.name.toUpperCase()} SERVICES&rdquo;) in consultation emails. Left out
                  of the email entirely when blank.
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Calendly Event Type URI (optional)</span>
                <input
                  name="calendly_event_type_uri"
                  type="url"
                  placeholder="https://api.calendly.com/event_types/…"
                  defaultValue={client.calendly_event_type_uri ?? ""}
                  className={inputClass}
                />
                <span className="text-[12px] text-slate-500">
                  Matches an incoming Calendly booking webhook to this client. Only needed once more than one client uses Calendly - find it in
                  the payload of a test booking, under <code>payload.scheduled_event.event_type</code>.
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Appointment Notification Emails</span>
                <textarea
                  name="appointment_notification_emails"
                  placeholder={"e.g. vikas@mantracollab.com, praveen@mantracollab.com"}
                  defaultValue={(client.appointment_notification_emails ?? []).join(", ")}
                  className={`${inputClass} min-h-[50px] resize-y`}
                />
                <span className="text-[12px] text-slate-500">
                  Who gets the immediate email when one of this client&apos;s appointments is booked, plus the 24-hour and 1-hour reminders
                  before it. Comma or newline-separated - supports more than one person. Leave blank to fall back to the single Contact Email
                  above.
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Internal Notes</span>
                <textarea name="notes" defaultValue={client.notes ?? ""} className={`${inputClass} min-h-[60px] resize-y`} />
              </label>
              <label className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" name="active" value="true" defaultChecked={client.active} />
                Active client
              </label>
              <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700">
                Save
              </button>
            </form>
          ) : (
            <dl className="mt-4 space-y-2 text-[14px]">
              <Row label="Contact" value={client.contact_name} />
              {client.contact_email && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {client.contact_email}
                    {isBounced(client.contact_email) && (
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">⚠ Bounced</span>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => clearBouncedEmailAction(client.contact_email!))}
                          className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
                        >
                          Clear &amp; Approve
                        </button>
                      </div>
                    )}
                  </dd>
                </div>
              )}
              <Row label="Phone" value={client.contact_phone} />
              <Row label="Consultation Booking Link" value={client.booking_link} />
              <Row label="Services Information Link" value={client.services_info_link} />
              <Row label="Calendly Event Type URI" value={client.calendly_event_type_uri} />
              <Row label="Appointment Notification Emails" value={(client.appointment_notification_emails ?? []).join(", ") || null} />
              {client.notes && (
                <div className="border-t border-slate-100 pt-2">
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-900">{client.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Campaigns</h2>
            <button type="button" onClick={() => setShowCampaignForm((v) => !v)} className="text-[12.5px] font-semibold text-sky-600">
              {showCampaignForm ? "Cancel" : "+ Add Campaign"}
            </button>
          </div>

          {showCampaignForm && (
            <form
              action={(formData) => runAction(() => createCampaignAction(client.id, formData), () => setShowCampaignForm(false))}
              className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3"
            >
              <input name="name" placeholder="Campaign name" required className={inputClass} />
              <textarea name="description" placeholder="Description (optional)" className={`${inputClass} min-h-[50px] resize-y`} />
              <input name="booking_link" type="url" placeholder="Campaign booking link (optional - overrides client default)" className={inputClass} />
              <div className="grid grid-cols-2 gap-2">
                <input name="start_date" type="date" className={inputClass} />
                <input name="end_date" type="date" className={inputClass} />
              </div>
              <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-sky-700">
                Create Campaign
              </button>
            </form>
          )}

          {campaigns.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No campaigns yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {campaigns.map((campaign) => (
                <li key={campaign.id} className="rounded-lg border border-slate-200 px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <Link href={`/leadgen/admin/campaigns/${campaign.id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                      {campaign.name}
                    </Link>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 capitalize">
                      {campaign.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    {leadCountByCampaign[campaign.id] ?? 0} leads · {appointmentCountByCampaign[campaign.id] ?? 0} appointments
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6">
        <CommunicationsSection
          client={client}
          campaigns={campaigns}
          emails={emails}
          templates={templates}
          showComposer={showComposer}
          setShowComposer={setShowComposer}
          isPending={isPending}
          runAction={runAction}
          isBounced={isBounced}
        />
      </div>
    </div>
  );
}

function CommunicationsSection({
  client,
  campaigns,
  emails,
  templates,
  showComposer,
  setShowComposer,
  isPending,
  runAction,
  isBounced,
}: {
  client: LeadgenClientRow;
  campaigns: LeadgenCampaignRow[];
  emails: LeadgenEmailRow[];
  templates: LeadgenEmailTemplateRow[];
  showComposer: boolean;
  setShowComposer: (v: boolean) => void;
  isPending: boolean;
  runAction: (fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) => void;
  isBounced: (email: string | null | undefined) => boolean;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [servicesUrl, setServicesUrl] = useState("");

  // These templates use {{first_name}}/{{client_business_name}}/booking &
  // services sections that only get filled in from a lead's profile page.
  // This composer has no lead in scope, so offering them here produced the
  // "Thank you for your interest in ." bug (blank vars, no buttons, no
  // client name in the signature) - excluded so it can't happen again.
  // "consultation_invitation" is deliberately not excluded - see
  // applyTemplate below, which renders it correctly here instead.
  const composerTemplates = useMemo(() => templates.filter((t) => !LEADGEN_LEAD_ONLY_TEMPLATE_KEYS.includes(t.key)), [templates]);

  const filtered = useMemo(
    () =>
      emails.filter((e) => {
        if (statusFilter !== "all" && e.status !== statusFilter) return false;
        if (campaignFilter !== "all" && e.campaign_id !== campaignFilter) return false;
        return true;
      }),
    [emails, statusFilter, campaignFilter]
  );

  function applyTemplate(key: string) {
    setSelectedTemplate(key);
    const template = composerTemplates.find((t) => t.key === key);
    if (!template) return;

    if (key === "consultation_invitation") {
      // No lead in scope here, so there's no real first name or real
      // prospect business name - "there" / "your business" are generic
      // but never-broken fallbacks (the template's subject and body both
      // reference {{business_name}} now - see migration 0096). Everything
      // else (client name, booking/services links, signature) comes from
      // real client data via the same Brent's Essentials fallback used on
      // lead pages.
      const branding = resolveLeadgenEmailBranding(client, client.booking_link, client.services_info_link);
      const bookingSection = leadgenBookingInviteSection(branding.bookingUrl, LEADGEN_BOOKING_BUTTON_LABEL);
      const servicesSection = leadgenServicesInviteSection(branding.servicesUrl, branding.clientName);
      const vars = { first_name: "there", business_name: "your business", client_business_name: branding.clientName, booking_section: bookingSection, services_section: servicesSection };
      setSubject(renderLeadgenTemplate(template.subject, vars));
      setBody(renderLeadgenTemplate(template.body, vars));
      setBookingUrl(branding.bookingUrl ?? "");
      setServicesUrl(branding.servicesUrl ?? "");
      return;
    }

    setSubject(template.subject);
    setBody(template.body.replace(/\{\{\w+\}\}/g, "").trim());
    setBookingUrl("");
    setServicesUrl("");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Communications</h2>
        <button
          type="button"
          onClick={() => setShowComposer(!showComposer)}
          className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700"
        >
          {showComposer ? "Cancel" : "+ Draft New Email"}
        </button>
      </div>

      {showComposer && (
        <form
          action={(formData) =>
            runAction(() => sendClientCommunicationAction(client.id, formData), () => {
              setShowComposer(false);
              setSubject("");
              setBody("");
              setSelectedTemplate("");
              setBookingUrl("");
              setServicesUrl("");
            })
          }
          className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Start from a Template (optional)</span>
            <select value={selectedTemplate} onChange={(e) => applyTemplate(e.target.value)} className={inputClass}>
              <option value="">Blank email</option>
              {composerTemplates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="template_key" value={selectedTemplate} />
          <input type="hidden" name="booking_url" value={bookingUrl} />
          <input type="hidden" name="services_url" value={servicesUrl} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">To</span>
              <input name="to_email" type="email" required defaultValue={client.contact_email ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Campaign (optional)</span>
              <select name="campaign_id" className={inputClass} defaultValue="">
                <option value="">No specific campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Subject</span>
            <input name="subject" required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Message</span>
            <textarea
              name="body"
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={`${inputClass} min-h-[160px] resize-y`}
            />
          </label>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700">
            {isPending ? "Sending…" : "Send Email"}
          </button>
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="all">All statuses</option>
          {(["draft", "sending", "sent", "delivered", "delayed", "bounced", "complained", "failed"] as const).map((s) => (
            <option key={s} value={s}>
              {LEADGEN_EMAIL_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="all">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-slate-500">No emails sent to this client yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3">Subject</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last Updated</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((email) => {
                const reason = email.status === "bounced" ? email.bounce_reason : email.status === "failed" ? email.failure_reason : null;
                return (
                  <tr key={email.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-600">{new Date(email.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">
                      {email.to_email}
                      {isBounced(email.to_email) && <span className="ml-1.5 text-[11px] font-semibold text-rose-600">⚠</span>}
                    </td>
                    <td className="py-2 pr-3 max-w-[220px] truncate">{email.subject}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[email.status]}`}>
                        {LEADGEN_EMAIL_STATUS_LABELS[email.status]}
                      </span>
                      {reason && <div className="mt-1 max-w-[220px] text-[11px] text-slate-500">{reason}</div>}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{new Date(leadgenEmailStatusAt(email)).toLocaleString()}</td>
                    <td className="py-2 pr-3">
                      {(email.status === "failed" || email.status === "bounced") && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => resendLeadgenEmailAction(email.id))}
                          className="text-[12px] font-semibold text-sky-600 hover:text-sky-700"
                        >
                          Resend
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
