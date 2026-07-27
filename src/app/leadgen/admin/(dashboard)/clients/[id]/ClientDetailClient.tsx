"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  LEADGEN_EMAIL_STATUS_STYLES,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenEmailRow,
  type LeadgenEmailTemplateRow,
} from "@/lib/leadgen-types";
import { updateClientAction, createCampaignAction, resendLeadgenEmailAction } from "../../actions";
import { sendClientCommunicationAction } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export default function ClientDetailClient({
  client,
  campaigns,
  emails,
  templates,
  leadCountByCampaign,
  totalLeads,
}: {
  client: LeadgenClientRow;
  campaigns: LeadgenCampaignRow[];
  emails: LeadgenEmailRow[];
  templates: LeadgenEmailTemplateRow[];
  leadCountByCampaign: Record<string, number>;
  totalLeads: number;
}) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            /{client.slug} · {totalLeads} lead{totalLeads === 1 ? "" : "s"} · {campaigns.length} campaign
            {campaigns.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/leadgen/admin/clients" className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
          ← All Clients
        </Link>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
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
                <input name="booking_link" type="url" placeholder="https://…" defaultValue={client.booking_link ?? ""} className={inputClass} />
                <span className="text-[12px] text-slate-500">
                  Used by every consultation email sent to this client&rsquo;s leads. Leave blank to have those emails ask the prospect to reply
                  instead of showing a link.
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
              <Row label="Email" value={client.contact_email} />
              <Row label="Phone" value={client.contact_phone} />
              <Row label="Consultation Booking Link" value={client.booking_link} />
              {client.notes && (
                <div className="border-t border-slate-100 pt-2">
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-900">{client.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
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
                  <p className="mt-1 text-[12.5px] text-slate-500">{leadCountByCampaign[campaign.id] ?? 0} leads</p>
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
}: {
  client: LeadgenClientRow;
  campaigns: LeadgenCampaignRow[];
  emails: LeadgenEmailRow[];
  templates: LeadgenEmailTemplateRow[];
  showComposer: boolean;
  setShowComposer: (v: boolean) => void;
  isPending: boolean;
  runAction: (fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) => void;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

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
    const template = templates.find((t) => t.key === key);
    if (template) {
      setSubject(template.subject);
      setBody(template.body.replace(/\{\{\w+\}\}/g, "").trim());
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
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
            })
          }
          className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Start from a Template (optional)</span>
            <select value={selectedTemplate} onChange={(e) => applyTemplate(e.target.value)} className={inputClass}>
              <option value="">Blank email</option>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="template_key" value={selectedTemplate} />
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
          {(["draft", "sending", "sent", "delivered", "bounced", "failed"] as const).map((s) => (
            <option key={s} value={s}>
              {s}
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
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((email) => (
                <tr key={email.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 text-slate-600">{new Date(email.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">{email.to_email}</td>
                  <td className="py-2 pr-3 max-w-[220px] truncate">{email.subject}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[email.status]}`}>
                      {email.status}
                    </span>
                  </td>
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
              ))}
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
