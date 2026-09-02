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
import type { MarketingJobSummary } from "@/lib/crm-marketing-job";

type ActionResult = { error?: string; success?: string };
type RunJobResult = ActionResult & { summary?: MarketingJobSummary };

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
    sendTestEmail: (templateId: string, toEmail: string) => Promise<ActionResult>;
    runJobNow: (dryRun: boolean) => Promise<RunJobResult>;
  };
};

const eligibleStages = new Set(["Contacted", "Interested", "Consultation Booked", "Proposal or Application Sent", "Follow-Up Required"]);
const statusStyle: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  stopped: "bg-slate-100 text-slate-700",
  unsubscribed: "bg-rose-100 text-rose-800",
};

// Compact date format for the Campaign Contacts list (e.g. "Sep 2, 2026,
// 1:23 AM") - short enough to fit a narrow table column or card without
// wrapping onto three lines, while still showing the exact send time.
function formatDateCompact(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

      <RunMarketingJobNow runJobNow={actions.runJobNow} />

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

        {/* Below xl (the sidebar-shell's own breakpoint - CrmShell only
            reserves its 256px sidebar at lg/1024px+, so a fixed-width
            table can't reliably fit until a wider point than that): one
            card per contact, so nothing ever needs a horizontal
            scrollbar to reach Sent/Pause/Stop on a laptop, tablet, or
            phone. */}
        <div className="mt-4 space-y-3 xl:hidden">
          {enrollments.map((enrollment) => {
            const opportunity = opportunityById.get(enrollment.opportunity_id);
            const delivery = latestDeliveryByEnrollment.get(enrollment.id);
            return (
              <div key={enrollment.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/crm/opportunities/${enrollment.opportunity_id}`}
                      className="block truncate font-semibold text-sky-700 hover:underline"
                    >
                      {opportunity?.business_name ?? "Removed opportunity"}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{opportunity?.email ?? "No email"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle[enrollment.status]}`}>
                    {MARKETING_ENROLLMENT_STATUS_LABELS[enrollment.status]}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-400">Campaign</p>
                    <p className="mt-0.5 text-slate-700">{MARKETING_CAMPAIGN_LABELS[enrollment.campaign_type]}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-400">Consent</p>
                    <p className="mt-0.5 capitalize text-slate-700" title={enrollment.consent_notes}>
                      {enrollment.consent_basis}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-400">Next Email</p>
                    <p className="mt-0.5 text-slate-700">{enrollment.status === "active" ? formatDateCompact(enrollment.next_send_at) : "—"}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-400">Sent</p>
                    <p className="mt-0.5 font-semibold text-slate-800">{enrollment.send_count}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="font-semibold uppercase tracking-wide text-slate-400">Last Email</p>
                    <p className="mt-0.5 text-slate-700">
                      {formatDateCompact(enrollment.last_sent_at)}
                      {delivery && delivery.status !== "sending" && (
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_STATUS_STYLES[delivery.status]}`}>
                          {EMAIL_STATUS_LABELS[delivery.status]}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {enrollment.last_error && <p className="mt-2.5 text-xs text-rose-600">{enrollment.last_error}</p>}

                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <EnrollmentControls enrollment={enrollment} isPending={isPending} actions={actions} runAction={runAction} />
                </div>
              </div>
            );
          })}
        </div>

        {/* xl (1280px) and up: a narrower, fixed-layout table (no
            min-width, cells wrap instead of forcing the table wider than
            its container) so it fits without its own horizontal
            scrollbar even alongside the 256px sidebar. Last Email and its
            delivery status move under Next Email, and Consent moves
            under Status, to keep this to six columns. */}
        <div className="mt-4 hidden overflow-x-auto xl:block">
          <table className="w-full table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[25%]" />
              <col className="w-[13%]" />
              <col className="w-[19%]" />
              <col className="w-[19%]" />
              <col className="w-[8%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2 pr-3">Business</th>
                <th className="py-2 pr-3">Campaign</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Next Email</th>
                <th className="py-2 pr-3">Sent</th>
                <th className="py-2">Controls</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((enrollment) => {
                const opportunity = opportunityById.get(enrollment.opportunity_id);
                const delivery = latestDeliveryByEnrollment.get(enrollment.id);
                return (
                  <tr key={enrollment.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3">
                      <Link
                        href={`/admin/crm/opportunities/${enrollment.opportunity_id}`}
                        className="break-words font-semibold text-sky-700 hover:underline"
                      >
                        {opportunity?.business_name ?? "Removed opportunity"}
                      </Link>
                      <div className="mt-0.5 break-all text-xs text-slate-500">{opportunity?.email ?? "No email"}</div>
                    </td>
                    <td className="py-3 pr-3 break-words text-slate-700">{MARKETING_CAMPAIGN_LABELS[enrollment.campaign_type]}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle[enrollment.status]}`}>
                        {MARKETING_ENROLLMENT_STATUS_LABELS[enrollment.status]}
                      </span>
                      <div className="mt-1.5 capitalize text-[11px] text-slate-500" title={enrollment.consent_notes}>
                        {enrollment.consent_basis} consent
                      </div>
                      {enrollment.last_error && <div className="mt-1 break-words text-[11px] text-rose-600">{enrollment.last_error}</div>}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="text-slate-700">{enrollment.status === "active" ? formatDateCompact(enrollment.next_send_at) : "—"}</div>
                      <div className="mt-1.5 text-[11px] text-slate-400">Last: {formatDateCompact(enrollment.last_sent_at)}</div>
                      {delivery && delivery.status !== "sending" && (
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_STATUS_STYLES[delivery.status]}`}>
                          {EMAIL_STATUS_LABELS[delivery.status]}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-semibold text-slate-800">{enrollment.send_count}</td>
                    <td className="py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <EnrollmentControls enrollment={enrollment} isPending={isPending} actions={actions} runAction={runAction} />
                      </div>
                    </td>
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
              <TemplateTestSend templateId={template.id} sendTestEmail={actions.sendTestEmail} />
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}

// Pause/Resume/Stop for one enrollment - shared by both the card layout
// (below xl) and the table layout (xl+) so the exact same controls,
// permissions, and behavior render either way; only the surrounding
// markup differs.
function EnrollmentControls({
  enrollment,
  isPending,
  actions,
  runAction,
}: {
  enrollment: CrmMarketingEnrollmentRow;
  isPending: boolean;
  actions: Pick<Props["actions"], "pause" | "resume" | "stop">;
  runAction: (action: () => Promise<ActionResult>) => void;
}) {
  return (
    <>
      {enrollment.status === "active" && (
        <button
          disabled={isPending}
          onClick={() => runAction(() => actions.pause(enrollment.id))}
          className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 disabled:opacity-50"
        >
          Pause
        </button>
      )}
      {(enrollment.status === "paused" || enrollment.status === "stopped") && (
        <button
          disabled={isPending}
          onClick={() => runAction(() => actions.resume(enrollment.id))}
          className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50"
        >
          Resume
        </button>
      )}
      {!["stopped", "unsubscribed"].includes(enrollment.status) && (
        <button
          disabled={isPending}
          onClick={() => runAction(() => actions.stop(enrollment.id))}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          Stop
        </button>
      )}
    </>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

// Manually runs the exact same job the daily crm-weekly-marketing cron
// runs (src/lib/crm-marketing-job.ts, via runMarketingJobNowAction),
// authenticated by this admin's own session instead of the Vercel Cron
// CRON_SECRET - the safe way to process due contacts (e.g. verify a
// newly-enrolled test contact) right now without ever touching that
// secret. "Preview" runs with dryRun=true: reports exactly who is due and
// what would be sent, without sending anything or writing anything.
// "Run Now" is a real send to whichever real contacts are actually due -
// not a sample/test send - so it's a deliberately separate, clearly
// labeled control from each template's own "Send Test Email" above.
function RunMarketingJobNow({ runJobNow }: { runJobNow: (dryRun: boolean) => Promise<RunJobResult> }) {
  const router = useRouter();
  const [running, setRunning] = useState<"preview" | "run" | null>(null);
  const [result, setResult] = useState<RunJobResult | null>(null);

  async function handleRun(dryRun: boolean) {
    if (running) return;
    setRunning(dryRun ? "preview" : "run");
    setResult(null);
    const outcome = await runJobNow(dryRun);
    setRunning(null);
    setResult(outcome);
    // A real (non-dry) run can advance enrollments and record deliveries -
    // refresh so the "Campaign Contacts" table below reflects the new
    // Last Email/Sent/Next Email immediately, same as every other action
    // in this page (see runAction() above).
    if (!dryRun && !outcome.error) router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-lg font-bold text-slate-900">Run Weekly Marketing Now</h2>
      <p className="mt-1 text-sm text-slate-500">
        Manually runs the same job the daily scheduler runs, authenticated as you instead of the Vercel Cron secret. Only contacts
        already due (Next Email in the past) are processed. Preview first to see who would be emailed without sending anything.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={running !== null}
          onClick={() => handleRun(true)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running === "preview" ? "Previewing…" : "Preview (Dry Run)"}
        </button>
        <button
          type="button"
          disabled={running !== null}
          onClick={() => handleRun(false)}
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running === "run" ? "Running…" : "Run Now"}
        </button>
      </div>
      {result && (
        <div className="mt-4">
          <p className={`text-sm font-medium ${result.error ? "text-rose-600" : "text-emerald-700"}`}>{result.error ?? result.success}</p>
          {result.summary && result.summary.results.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                    <th className="py-2 pr-3">Business</th>
                    <th className="py-2 pr-3">Recipient</th>
                    <th className="py-2 pr-3">Campaign</th>
                    <th className="py-2 pr-3">Outcome</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {result.summary.results.map((row, index) => (
                    <tr key={`${row.enrollmentId}-${index}`} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{row.businessName}</td>
                      <td className="py-2 pr-3 text-slate-600">{row.recipientEmail ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-600">{MARKETING_CAMPAIGN_LABELS[row.campaignType as keyof typeof MARKETING_CAMPAIGN_LABELS] ?? row.campaignType}</td>
                      <td className="py-2 pr-3 capitalize text-slate-700">{row.outcome.replace("_", " ")}</td>
                      <td className="py-2 text-slate-500">{row.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Sends this exact saved template, with sample data, to an address the
// admin enters here - never a real contact, never advances a real
// enrollment (src/lib/send-test-email.ts's sendCrmMarketingTestEmail).
// Deliberately its own <div>, not a nested <form> (the template card
// above is already a <form> that saves the template on submit) - every
// control below is type="button" so it can never trigger that outer
// submit, and this row keeps its own isolated pending/message state so
// testing one template never disturbs another template's Save button.
function TemplateTestSend({ templateId, sendTestEmail }: { templateId: string; sendTestEmail: (templateId: string, toEmail: string) => Promise<ActionResult> }) {
  const [toEmail, setToEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function handleSend() {
    if (sending || !toEmail.trim()) return;
    setSending(true);
    setResult(null);
    const outcome = await sendTestEmail(templateId, toEmail);
    setSending(false);
    setResult(outcome);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <input
        type="email"
        value={toEmail}
        onChange={(event) => setToEmail(event.target.value)}
        placeholder="you@winsalotcorp.com"
        className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-xs normal-case text-slate-800"
      />
      <button
        type="button"
        disabled={sending || !toEmail.trim()}
        onClick={handleSend}
        className="rounded-md border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send Test Email"}
      </button>
      {result && (
        <span className={`text-xs font-medium ${result.error ? "text-rose-600" : "text-emerald-700"}`}>{result.error ?? result.success}</span>
      )}
    </div>
  );
}
