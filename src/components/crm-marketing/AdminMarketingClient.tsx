"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_STYLES,
  OPPORTUNITY_TYPE_LABELS,
} from "@/lib/crm-types";
import {
  MARKETING_CAMPAIGN_LABELS,
  MARKETING_CAMPAIGN_TYPES,
  MARKETING_ENROLLMENT_STATUS_LABELS,
  type CrmMarketingDeliveryRow,
  type CrmMarketingEnrollmentRow,
  type CrmMarketingTemplateRow,
  type MarketingOpportunitySummary,
} from "@/lib/crm-marketing-types";

type ActionResult = { error?: string; success?: string };

type Props = {
  opportunities: MarketingOpportunitySummary[];
  enrollments: CrmMarketingEnrollmentRow[];
  templates: CrmMarketingTemplateRow[];
  deliveries: CrmMarketingDeliveryRow[];
  actions: {
    enroll: (formData: FormData) => Promise<ActionResult>;
    pause: (id: string) => Promise<ActionResult>;
    resume: (id: string) => Promise<ActionResult>;
    stop: (id: string) => Promise<ActionResult>;
    updateTemplate: (id: string, formData: FormData) => Promise<ActionResult>;
  };
};

const eligibleStages = new Set(["Contacted", "Interested", "Consultation Booked", "Proposal or Application Sent", "Follow-Up Required"]);
const statusStyle: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  stopped: "bg-slate-100 text-slate-700",
  unsubscribed: "bg-rose-100 text-rose-800",
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function AdminMarketingClient({ opportunities, enrollments, templates, deliveries, actions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");

  const opportunityById = useMemo(() => new Map(opportunities.map((opportunity) => [opportunity.id, opportunity])), [opportunities]);
  const enrolledIds = useMemo(() => new Set(enrollments.map((enrollment) => enrollment.opportunity_id)), [enrollments]);
  const eligibleOpportunities = opportunities.filter(
    (opportunity) => eligibleStages.has(opportunity.stage) && !!opportunity.email && !enrolledIds.has(opportunity.id)
  );
  const selectedOpportunity = opportunityById.get(selectedOpportunityId);
  const orderedTemplates = useMemo(
    () =>
      [...templates].sort(
        (a, b) =>
          MARKETING_CAMPAIGN_TYPES.indexOf(a.campaign_type) - MARKETING_CAMPAIGN_TYPES.indexOf(b.campaign_type) ||
          a.sequence_number - b.sequence_number
      ),
    [templates]
  );
  const latestDeliveryByEnrollment = useMemo(() => {
    const map = new Map<string, CrmMarketingDeliveryRow>();
    for (const delivery of deliveries) if (!map.has(delivery.enrollment_id)) map.set(delivery.enrollment_id, delivery);
    return map;
  }, [deliveries]);

  const activeCount = enrollments.filter((enrollment) => enrollment.status === "active").length;
  const dueCount = enrollments.filter((enrollment) => enrollment.status === "active" && new Date(enrollment.next_send_at) <= new Date()).length;
  const sentCount = deliveries.filter((delivery) => delivery.status !== "sending" && delivery.status !== "failed").length;

  function runAction(action: () => Promise<ActionResult>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (!result.error) router.refresh();
    });
  }

  function submitEnrollment(formData: FormData) {
    runAction(async () => {
      const result = await actions.enroll(formData);
      if (!result.error) setSelectedOpportunityId("");
      return result;
    });
  }

  return (
    <div className="space-y-6">
      {message && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${message.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {message.error ?? message.success}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Active Campaigns" value={activeCount} detail="Sending every seven days" />
        <SummaryCard label="Due for Next Run" value={dueCount} detail="Processed by the daily scheduler" />
        <SummaryCard label="Emails Recorded" value={sentCount} detail="Sent and engagement tracked" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-lg font-bold text-slate-900">Add a Contacted Business</h2>
        <p className="mt-1 text-sm text-slate-500">The campaign is locked to the service already recorded on the opportunity. A consent record is required before automatic sending begins.</p>
        <form action={submitEnrollment} className="mt-4 grid gap-4 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">
            Contacted business
            <select name="opportunity_id" required value={selectedOpportunityId} onChange={(event) => setSelectedOpportunityId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">Select a business</option>
              {eligibleOpportunities.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>{opportunity.business_name} — {OPPORTUNITY_TYPE_LABELS[opportunity.opportunity_type]}</option>
              ))}
            </select>
            <input type="hidden" name="campaign_type" value={selectedOpportunity?.opportunity_type ?? ""} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Consent basis
            <select name="consent_basis" required defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="" disabled>Select one</option>
              <option value="express">Express consent</option>
              <option value="implied">Implied consent</option>
            </select>
          </label>
          <div className="flex items-end">
            <button disabled={isPending || !selectedOpportunity} className="w-full rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50">Activate Weekly Emails</button>
          </div>
          <label className="text-sm font-medium text-slate-700 lg:col-span-4">
            Consent record
            <textarea name="consent_notes" required rows={2} placeholder="Example: Owner agreed during our call on September 1, 2026, or describe the valid business relationship/publication basis." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </form>
        {eligibleOpportunities.length === 0 && <p className="mt-4 text-sm text-slate-500">There are no additional contacted businesses with email addresses ready to enroll.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-lg font-bold text-slate-900">Campaign Contacts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-[13px]">
            <thead><tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500"><th className="py-2 pr-3">Business</th><th className="py-2 pr-3">Campaign</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Consent</th><th className="py-2 pr-3">Last Email</th><th className="py-2 pr-3">Next Email</th><th className="py-2 pr-3">Sent</th><th className="py-2">Controls</th></tr></thead>
            <tbody>
              {enrollments.map((enrollment) => {
                const opportunity = opportunityById.get(enrollment.opportunity_id);
                const delivery = latestDeliveryByEnrollment.get(enrollment.id);
                return (
                  <tr key={enrollment.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3"><Link href={`/admin/crm/opportunities/${enrollment.opportunity_id}`} className="font-semibold text-sky-700 hover:underline">{opportunity?.business_name ?? "Removed opportunity"}</Link><div className="text-xs text-slate-500">{opportunity?.email ?? "No email"}</div></td>
                    <td className="py-3 pr-3">{MARKETING_CAMPAIGN_LABELS[enrollment.campaign_type]}</td>
                    <td className="py-3 pr-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle[enrollment.status]}`}>{MARKETING_ENROLLMENT_STATUS_LABELS[enrollment.status]}</span>{enrollment.last_error && <div className="mt-2 max-w-56 text-xs text-rose-600">{enrollment.last_error}</div>}</td>
                    <td className="py-3 pr-3 capitalize">{enrollment.consent_basis}<div className="mt-1 max-w-64 text-xs text-slate-500">{enrollment.consent_notes}</div></td>
                    <td className="py-3 pr-3">{formatDate(enrollment.last_sent_at)}{delivery && delivery.status !== "sending" && <div className="mt-1"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_STATUS_STYLES[delivery.status]}`}>{EMAIL_STATUS_LABELS[delivery.status]}</span></div>}</td>
                    <td className="py-3 pr-3">{enrollment.status === "active" ? formatDate(enrollment.next_send_at) : "—"}</td>
                    <td className="py-3 pr-3 font-semibold">{enrollment.send_count}</td>
                    <td className="py-3"><div className="flex flex-wrap gap-2">{enrollment.status === "active" && <button disabled={isPending} onClick={() => runAction(() => actions.pause(enrollment.id))} className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700">Pause</button>}{(enrollment.status === "paused" || enrollment.status === "stopped") && <button disabled={isPending} onClick={() => runAction(() => actions.resume(enrollment.id))} className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700">Resume</button>}{!(["stopped", "unsubscribed"].includes(enrollment.status)) && <button disabled={isPending} onClick={() => runAction(() => actions.stop(enrollment.id))} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700">Stop</button>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {enrollments.length === 0 && <p className="mt-4 text-sm text-slate-500">No businesses are enrolled yet.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-lg font-bold text-slate-900">Weekly Email Sequence</h2>
        <p className="mt-1 text-sm text-slate-500">Four messages rotate for each service. You may edit the wording; service matching and unsubscribe information remain automatic.</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {orderedTemplates.map((template) => (
            <form key={template.id} action={(formData) => runAction(() => actions.updateTemplate(template.id, formData))} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-slate-900">{MARKETING_CAMPAIGN_LABELS[template.campaign_type]} — Week {template.sequence_number}</h3><span className="text-xs text-slate-500">{template.active ? "Active" : "Inactive"}</span></div>
              <label className="text-xs font-semibold uppercase text-slate-500">Subject<input name="subject" defaultValue={template.subject} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-800" /></label>
              <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">Message<textarea name="body" rows={7} defaultValue={template.body} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-800" /></label>
              <div className="mt-3 flex gap-3"><label className="flex-1 text-xs font-semibold uppercase text-slate-500">Link label<input name="cta_label" defaultValue={template.cta_label} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-800" /></label><div className="flex items-end"><button disabled={isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save Template</button></div></div>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
