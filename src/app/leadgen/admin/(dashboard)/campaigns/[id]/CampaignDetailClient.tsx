"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Users, Star, CalendarCheck, CheckCircle2, Percent, Target } from "lucide-react";
import {
  isLeadgenAppointmentCountable,
  LEADGEN_LEAD_STATUS_STYLES,
  type LeadgenAppointmentRow,
  type LeadgenCampaignAgentRow,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenLeadRow,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import KpiCard from "@/components/crm-ui/KpiCard";
import { assignCampaignAgentsAction, updateCampaignAction } from "../../actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export default function CampaignDetailClient({
  campaign,
  client,
  leads,
  appointments,
  agents,
  assignedAgents,
  bookingLink,
}: {
  campaign: LeadgenCampaignRow;
  client: LeadgenClientRow;
  leads: LeadgenLeadRow[];
  appointments: LeadgenAppointmentRow[];
  // Every active agent, for the "Assigned Agents" checkbox list below.
  agents: LeadgenUserRow[];
  // This campaign's current leadgen_campaign_agents rows - an agent with
  // any row here (for ANY campaign) is restricted to only their assigned
  // campaign(s); an agent with none is fully unrestricted, exactly as
  // before this feature existed.
  assignedAgents: LeadgenCampaignAgentRow[];
  // The client's public "/book/<slug>" booking link, already resolved to
  // an absolute URL (see resolveSiteRelativeUrl) - copyable so an agent
  // can send it manually.
  bookingLink: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentsSaved, setAgentsSaved] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const interested = leads.filter((l) => l.status === "Interested").length;
  const appointmentsBooked = appointments.filter((a) => isLeadgenAppointmentCountable(a.status)).length;
  const appointmentsCompleted = appointments.filter((a) => a.status === "Completed").length;
  const conversionRate = leads.length > 0 ? Math.round((appointmentsBooked / leads.length) * 100) : 0;
  const qualifiedAppointments = appointments.filter((a) => a.incentive_status === "Qualified").length;
  const qualifiedLabel =
    campaign.appointment_goal != null ? `${qualifiedAppointments} of ${campaign.appointment_goal} qualified` : String(qualifiedAppointments);

  async function handleCopyLink() {
    if (!bookingLink) return;
    await navigator.clipboard.writeText(bookingLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
            {campaign.pilot_label && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">{campaign.pilot_label}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <Link href={`/leadgen/admin/clients/${client.id}`} className="font-semibold text-sky-600 hover:text-sky-700">
              {client.name}
            </Link>{" "}
            · {leads.length} leads
          </p>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-[13px] font-semibold text-sky-600">
          {editing ? "Cancel" : "Edit Campaign"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {editing ? (
        <form
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await updateCampaignAction(campaign.id, formData);
              if (result.error) setError(result.error);
              else setEditing(false);
            });
          }}
          className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Campaign Name</span>
            <input name="name" required defaultValue={campaign.name} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Status</span>
            <select name="status" defaultValue={campaign.status} className={inputClass}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-semibold text-slate-600">Description</span>
            <textarea name="description" defaultValue={campaign.description ?? ""} className={`${inputClass} min-h-[60px] resize-y`} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-semibold text-slate-600">Campaign Booking Link (overrides client default)</span>
            <input name="booking_link" type="url" defaultValue={campaign.booking_link ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Pilot Label (optional)</span>
            <input name="pilot_label" placeholder="e.g. 3-Appointment Pilot" defaultValue={campaign.pilot_label ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Appointment Goal (optional)</span>
            <input name="appointment_goal" type="number" min={0} step={1} defaultValue={campaign.appointment_goal ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Start Date</span>
            <input name="start_date" type="date" defaultValue={campaign.start_date ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">End Date</span>
            <input name="end_date" type="date" defaultValue={campaign.end_date ?? ""} className={inputClass} />
          </label>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700 sm:col-span-2 sm:w-fit">
            Save
          </button>
        </form>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
          {[
            { label: "Leads", value: String(leads.length), tone: "blue" as const, icon: Users },
            { label: "Interested", value: String(interested), tone: "indigo" as const, icon: Star },
            { label: "Appointments Booked", value: String(appointmentsBooked), tone: "green" as const, icon: CalendarCheck },
            { label: "Appointments Completed", value: String(appointmentsCompleted), tone: "teal" as const, icon: CheckCircle2 },
            { label: "Qualified Appointments", value: qualifiedLabel, tone: "amber" as const, icon: Target },
            { label: "Conversion Rate", value: `${conversionRate}%`, tone: "purple" as const, icon: Percent },
          ].map((stat) => (
            <KpiCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} icon={<stat.icon />} />
          ))}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Public Booking Link</h2>
        {bookingLink ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <code className="rounded-lg bg-slate-100 px-3 py-2 text-[12.5px] text-slate-700">{bookingLink}</code>
            <button
              type="button"
              onClick={handleCopyLink}
              className="rounded-full border border-slate-300 px-4 py-1.5 text-[12.5px] font-semibold text-slate-700 transition hover:border-slate-400"
            >
              {linkCopied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        ) : (
          <p className="mt-2.5 text-[13px] text-slate-500">No booking link configured for {client.name} yet - add one in Client Settings.</p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Assigned Agents</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">
          An agent checked here can only see leads, follow-ups, emails, and appointments for a campaign they&apos;re assigned to. An agent left
          unchecked everywhere keeps seeing everything, exactly as before.
        </p>
        {agents.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No active agents yet.</p>
        ) : (
          <form
            action={(formData) => {
              setAgentsError(null);
              setAgentsSaved(false);
              startTransition(async () => {
                const result = await assignCampaignAgentsAction(campaign.id, formData);
                if (result.error) setAgentsError(result.error);
                else setAgentsSaved(true);
              });
            }}
            className="mt-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {agents.map((agent) => (
                <label key={agent.id} className="flex items-center gap-2 text-[13.5px] text-slate-700">
                  <input
                    type="checkbox"
                    name="agent_ids"
                    value={agent.id}
                    defaultChecked={assignedAgents.some((a) => a.agent_id === agent.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {agent.full_name || agent.email}
                </label>
              ))}
            </div>
            {agentsError && <p className="mt-2.5 text-[13px] font-medium text-rose-600">{agentsError}</p>}
            {agentsSaved && <p className="mt-2.5 text-[13px] font-medium text-emerald-700">Assigned agents saved.</p>}
            <button
              type="submit"
              disabled={isPending}
              className="mt-3 rounded-full bg-sky-600 px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-sky-700"
            >
              Save Assigned Agents
            </button>
          </form>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Leads in this Campaign</h2>
        {leads.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No leads assigned to this campaign yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                  <th className="py-2 pr-3">Business</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Next Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <Link href={`/leadgen/admin/leads/${lead.id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                        {lead.business_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
