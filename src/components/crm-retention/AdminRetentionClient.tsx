"use client";

import { useMemo, useState, useTransition } from "react";
import { Users, UserCheck, PauseCircle, Clock, RefreshCw, Mail, CalendarClock, AlertTriangle } from "lucide-react";
import KpiCard from "@/components/crm-ui/KpiCard";
import StatusBadge from "@/components/crm-ui/StatusBadge";
import {
  RETENTION_CAMPAIGN_LABELS,
  RETENTION_STATUS_LABELS,
  RETENTION_STATUS_STYLES,
  RETENTION_TEST_EMAIL_RECIPIENTS,
  type CrmRetentionEmailRow,
  type CrmRetentionEnrollmentRow,
  type CrmRetentionFollowupRow,
  type CrmRetentionTemplateRow,
  type RetentionCampaignType,
  type RetentionClientSummary,
} from "@/lib/crm-retention-types";
import { EMAIL_STATUS_LABELS, EMAIL_STATUS_STYLES } from "@/lib/crm-types";
import type { RetentionJobSummary } from "@/lib/crm-retention-job";
import ManageMenu, { type ManageMenuItem } from "@/components/crm-ui/ManageMenu";

type ActionResult = { error?: string; success?: string };
type RunJobResult = ActionResult & { cadence?: RetentionJobSummary; followups?: RetentionJobSummary };
type AdminOption = { id: string; full_name: string; email: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";
const buttonPrimary = "rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50";
const buttonSubtle = "rounded-full border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const buttonDanger = "rounded-full border border-rose-300 px-3 py-1.5 text-[12.5px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50";

// Restore-default text mirrors the migration's seed content exactly, so
// "Restore Default" always produces the same copy the module ships with -
// keyed the same way crm_retention_templates is (campaign_type,
// sequence_number).
const DEFAULT_TEMPLATE_TEXT: Record<string, { subject: string; body: string }> = {
  "client_success:1": { subject: "Your Winsalot Partnership", body: "Hi {{first_name}},\n\nWe wanted to take a moment to recap what our team is doing behind the scenes for {{business_name}} — prospecting, appointment setting, timely follow-up, campaign support, reporting, and ongoing account support.\n\nWe are glad to be part of your growth, and we are always here if you would like to talk about how things are going." },
  "client_success:2": { subject: "Consistency Creates Results", body: "Hi {{first_name}},\n\nOutbound prospecting and lead generation work best through consistent outreach, follow-up, testing, and optimization over time — not a one-time push.\n\nThat steady, ongoing effort is exactly what our team keeps doing for {{business_name}} every week, and we will keep refining it as we learn what works best for your business." },
  "client_success:3": { subject: "Working Behind the Scenes", body: "Hi {{first_name}},\n\nA quick look at what has been happening for {{business_name}} recently: prospect tracking, calls, follow-ups, appointment management, reporting, and ongoing campaign monitoring and optimization.\n\nWe like keeping you in the loop on the work that supports your account, even when it is not always visible day to day." },
  "client_success:4": { subject: "Growing Together", body: "Hi {{first_name}},\n\nAs {{business_name}} continues to grow, we would love to hear whether you would like us to target any new industries, locations, services, offers, or customer segments.\n\nJust reply and let us know — we are happy to adjust the approach with you." },
  "client_success:5": { subject: "A Look at Your Winsalot Partnership", body: "Hi {{first_name}},\n\nWe wanted to check back in on everything our team continues to handle for {{business_name}} — prospecting, appointment setting, consistent follow-up, campaign support, reporting, and day-to-day account support.\n\nSupporting your growth is what we focus on, and we welcome any conversation about how things are going." },
  "client_success:6": { subject: "Why Consistency Matters for Your Results", body: "Hi {{first_name}},\n\nSteady, consistent outreach — paired with follow-up, testing, and ongoing optimization — is what tends to produce the best long-term results in lead generation.\n\nThat is the approach we continue to apply for {{business_name}}, and we are always refining it based on what we are seeing." },
  "client_success:7": { subject: "What We Have Been Working On", body: "Hi {{first_name}},\n\nHere is a quick update on the ongoing work for {{business_name}}: prospect tracking, outreach calls, follow-ups, appointment management, reporting, and continued campaign monitoring.\n\nWe want you to always have visibility into the effort behind your account." },
  "client_success:8": { subject: "Let's Keep Growing Together", body: "Hi {{first_name}},\n\nAs we continue supporting {{business_name}}, is there any new industry, location, service, offer, or customer segment you would like us to help you target next?\n\nWe would love to hear your thoughts whenever is convenient." },
  "follow_up:1": { subject: "Checking Back In", body: "Hi {{first_name}},\n\nWe wanted to reconnect regarding {{business_name}} now that some time has passed. If now is a better time to continue our conversation, we would be glad to pick things back up whenever works for you.\n\nJust reply and let us know how you would like to proceed." },
  "re_engagement:1": { subject: "Checking In With You", body: "Hi {{first_name}},\n\nIt has been a little while since we last connected about {{business_name}}, and we wanted to check in and see how things are going on your end.\n\nWe are here whenever you would like to reconnect." },
  "re_engagement:2": { subject: "Still Here to Support Your Growth", body: "Hi {{first_name}},\n\nWe wanted to remind you that Winsalot Corp is still here to support {{business_name}}'s growth whenever it is useful. Priorities can shift, so we would love to hear whether anything has changed on your end.\n\nFeel free to reply and let us know." },
  "re_engagement:3": { subject: "One Last Check-In", body: "Hi {{first_name}},\n\nWe have not heard back, so we wanted to send one last note. Would you like to continue working together, pause for now, or reconnect at a later time?\n\nWhatever works best for {{business_name}} is completely fine with us — just let us know." },
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value + (value.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// A shorter rendering of the same timestamp for the compact campaign
// table/cards - the full value (with year) is still available via the
// `title` tooltip and inside the Email History view.
function formatCompactDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default function AdminRetentionClient({
  clients,
  enrollments,
  followups,
  templates,
  emails,
  admins,
  actions,
}: {
  clients: RetentionClientSummary[];
  enrollments: CrmRetentionEnrollmentRow[];
  followups: CrmRetentionFollowupRow[];
  templates: CrmRetentionTemplateRow[];
  emails: CrmRetentionEmailRow[];
  admins: AdminOption[];
  actions: {
    enroll: (formData: FormData) => Promise<ActionResult>;
    pause: (enrollmentId: string) => Promise<ActionResult>;
    resume: (enrollmentId: string) => Promise<ActionResult>;
    stop: (enrollmentId: string) => Promise<ActionResult>;
    remove: (enrollmentId: string) => Promise<ActionResult>;
    changeCampaignType: (enrollmentId: string, formData: FormData) => Promise<ActionResult>;
    sendNow: (enrollmentId: string) => Promise<ActionResult>;
    scheduleFollowup: (formData: FormData) => Promise<ActionResult>;
    resolveFollowup: (followupId: string) => Promise<ActionResult>;
    cancelFollowup: (followupId: string) => Promise<ActionResult>;
    sendFollowupNow: (followupId: string) => Promise<ActionResult>;
    updateTemplate: (templateId: string, formData: FormData) => Promise<ActionResult>;
    restoreDefaultTemplate: (templateId: string, subject: string, body: string) => Promise<ActionResult>;
    sendTestEmail: (templateId: string, toEmail: string) => Promise<ActionResult>;
    runJobNow: (dryRun: boolean) => Promise<RunJobResult>;
  };
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [historyForEnrollment, setHistoryForEnrollment] = useState<string | null>(null);
  const [jobSummary, setJobSummary] = useState<RunJobResult | null>(null);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  function runAction(action: () => Promise<ActionResult>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: result.success ?? "Done." });
    });
  }

  const monthStart = startOfMonthIso();
  const summary = useMemo(() => {
    const active = enrollments.filter((e) => e.campaign_type === "client_success" && e.retention_status === "active");
    const paused = enrollments.filter((e) => e.retention_status === "paused");
    const followUp = enrollments.filter((e) => e.retention_status === "follow_up");
    const reEngagement = enrollments.filter((e) => e.retention_status === "re_engagement");
    const sentThisMonth = emails.filter((e) => e.sent_at && e.sent_at >= monthStart);
    const openFollowups = followups.filter((f) => !f.resolved_at && !f.cancelled_at);
    const nextScheduled = enrollments.filter((e) => e.next_send_at && ["active", "re_engagement"].includes(e.retention_status)).length + openFollowups.length;
    const failures = emails.filter((e) => e.status === "failed");
    return {
      totalEnrolled: enrollments.length,
      active: active.length,
      paused: paused.length,
      followUp: followUp.length,
      reEngagement: reEngagement.length,
      sentThisMonth: sentThisMonth.length,
      nextScheduled,
      failures: failures.length,
    };
  }, [enrollments, emails, followups, monthStart]);

  const unenrolledClients = clients.filter((c) => !enrollments.some((e) => e.client_id === c.id));

  const enrollmentRows = useMemo(
    () =>
      enrollments.map((enrollment) => ({
        enrollment,
        client: clientById.get(enrollment.client_id),
        lastEmail: emails.filter((e) => e.enrollment_id === enrollment.id)[0] ?? null,
      })),
    [enrollments, clientById, emails]
  );

  function handlersFor(enrollment: CrmRetentionEnrollmentRow, client: RetentionClientSummary | undefined) {
    return {
      onView: () => setHistoryForEnrollment(enrollment.id),
      onPause: () => runAction(() => actions.pause(enrollment.id)),
      onResume: () => runAction(() => actions.resume(enrollment.id)),
      onStop: () => {
        if (window.confirm(`Stop the retention campaign for ${client?.company_name ?? "this client"}? No further emails will be sent.`)) runAction(() => actions.stop(enrollment.id));
      },
      onRemove: () => {
        if (window.confirm(`Remove ${client?.company_name ?? "this client"} from Retention? Email history is preserved.`)) runAction(() => actions.remove(enrollment.id));
      },
      onSendNow: () => runAction(() => actions.sendNow(enrollment.id)),
      onChangeCampaignType: (fd: FormData) => runAction(() => actions.changeCampaignType(enrollment.id, fd)),
    };
  }

  return (
    <div>
      {message && (
        <p className={`mb-4 rounded-lg border px-4 py-3 text-sm ${message.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {message.text}
        </p>
      )}

      {/* Dashboard KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard label="Total Enrolled" value={summary.totalEnrolled} icon={<Users />} tone="blue" />
        <KpiCard label="Active Loyalty" value={summary.active} icon={<UserCheck />} tone="green" />
        <KpiCard label="Paused" value={summary.paused} icon={<PauseCircle />} tone="amber" />
        <KpiCard label="Follow-Up" value={summary.followUp} icon={<Clock />} tone="orange" />
        <KpiCard label="Re-Engagement" value={summary.reEngagement} icon={<RefreshCw />} tone="purple" />
        <KpiCard label="Emails Sent (Month)" value={summary.sentThisMonth} icon={<Mail />} tone="teal" />
        <KpiCard label="Next Scheduled" value={summary.nextScheduled} icon={<CalendarClock />} tone="indigo" />
        <KpiCard label="Delivery Failures" value={summary.failures} icon={<AlertTriangle />} tone="rose" />
      </div>

      {/* Enroll a client */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-slate-900">Enroll a Client</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">Enrollment is never automatic — choose exactly one campaign for each client.</p>
        <form action={(fd) => runAction(() => actions.enroll(fd))} className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-5">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[12px] font-medium text-slate-600">Client *</span>
            <select name="client_id" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Select a client…
              </option>
              {unenrolledClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Campaign *</span>
            <select name="campaign_type" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              <option value="client_success">Client Success</option>
              <option value="follow_up">Follow-Up</option>
              <option value="re_engagement">Re-Engagement</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Start Date</span>
            <input type="date" name="start_date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 self-end pb-2">
            <input type="checkbox" name="auto_send" defaultChecked className="h-4 w-4 rounded border-slate-300" />
            <span className="text-[12.5px] font-medium text-slate-600">Auto Send</span>
          </label>
          <div className="sm:col-span-5">
            <button type="submit" disabled={isPending} className={buttonPrimary}>
              Enroll in Retention
            </button>
          </div>
        </form>
      </section>

      {/* Campaign table */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-slate-900">Client Retention Campaigns</h2>

        {/* Desktop/laptop: compact table, Manage column pinned to the right so it never scrolls out of view */}
        <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Business / Client</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Campaign Type</th>
                <th className="px-3 py-2.5">Current Stage</th>
                <th className="px-3 py-2.5">Last/Current Send</th>
                <th className="px-3 py-2.5">Next Send</th>
                <th className="px-3 py-2.5">Delivery Status</th>
                <th className="sticky right-0 border-l border-slate-200 bg-white px-3 py-2.5">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {enrollmentRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No clients enrolled yet.
                  </td>
                </tr>
              )}
              {enrollmentRows.map(({ enrollment, client, lastEmail }) => (
                <EnrollmentRow key={enrollment.id} enrollment={enrollment} client={client} lastEmail={lastEmail} isPending={isPending} {...handlersFor(enrollment, client)} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Smaller screens: one compact card per campaign instead of a wide table */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:hidden">
          {enrollmentRows.length === 0 && <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">No clients enrolled yet.</p>}
          {enrollmentRows.map(({ enrollment, client, lastEmail }) => (
            <EnrollmentCard key={enrollment.id} enrollment={enrollment} client={client} lastEmail={lastEmail} isPending={isPending} {...handlersFor(enrollment, client)} />
          ))}
        </div>
      </section>

      {historyForEnrollment && (
        <EmailHistoryModal
          emails={emails.filter((e) => e.enrollment_id === historyForEnrollment)}
          clientName={clientById.get(enrollments.find((e) => e.id === historyForEnrollment)?.client_id ?? "")?.company_name ?? "Client"}
          onClose={() => setHistoryForEnrollment(null)}
        />
      )}

      {/* Follow-Up campaign */}
      <FollowupPanel clients={clients} followups={followups} admins={admins} isPending={isPending} runAction={runAction} actions={actions} clientById={clientById} />

      {/* Templates */}
      <TemplatesPanel templates={templates} isPending={isPending} runAction={runAction} actions={actions} />

      {/* Run job now */}
      <section className="mt-8 mb-8">
        <h2 className="text-base font-bold text-slate-900">Run Retention Job Now</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">Manually process due Client Success, Re-Engagement, and Follow-Up sends — identical to the daily automatic run.</p>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await actions.runJobNow(true);
                setJobSummary(result);
                setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: result.success ?? "Preview complete." });
              })
            }
            className={buttonSubtle}
          >
            Preview
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await actions.runJobNow(false);
                setJobSummary(result);
                setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: result.success ?? "Run complete." });
              })
            }
            className={buttonPrimary}
          >
            Run Now
          </button>
        </div>
        {jobSummary && (jobSummary.cadence || jobSummary.followups) && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12.5px] text-slate-600">
            {jobSummary.cadence && (
              <p>
                Client Success / Re-Engagement — {jobSummary.cadence.candidates} due, {jobSummary.cadence.sent} sent, {jobSummary.cadence.failed} failed, {jobSummary.cadence.skipped} skipped.
              </p>
            )}
            {jobSummary.followups && (
              <p>
                Follow-Up — {jobSummary.followups.candidates} due, {jobSummary.followups.sent} sent, {jobSummary.followups.failed} failed, {jobSummary.followups.skipped} skipped.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

type EnrollmentRowHandlers = {
  onView: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRemove: () => void;
  onSendNow: () => void;
  onChangeCampaignType: (formData: FormData) => void;
};

// Same "applicable actions" the row previously rendered as six stacked
// buttons, now the contents of a single Manage ▾ menu. Nothing here
// changes what an action does - only how it is reached.
export function buildManageItems(enrollment: CrmRetentionEnrollmentRow, isPending: boolean, handlers: EnrollmentRowHandlers): ManageMenuItem[] {
  const canSendNow = enrollment.campaign_type !== "follow_up" && ["active", "re_engagement"].includes(enrollment.retention_status);
  const canPause = ["active", "re_engagement"].includes(enrollment.retention_status);
  const canActivate = enrollment.retention_status === "inactive";
  const canResume = enrollment.retention_status === "paused";

  return [
    { key: "view", label: "View", onSelect: handlers.onView },
    { key: "email-history", label: "Email History", onSelect: handlers.onView },
    { key: "send-now", label: "Send Now", hidden: !canSendNow, disabled: isPending, onSelect: handlers.onSendNow },
    { key: "activate", label: "Activate", hidden: !canActivate, disabled: isPending, onSelect: handlers.onResume },
    { key: "pause", label: "Pause", hidden: !canPause, disabled: isPending, onSelect: handlers.onPause },
    { key: "resume", label: "Resume", hidden: !canResume, disabled: isPending, onSelect: handlers.onResume },
    { key: "stop", label: "Stop", danger: true, disabled: isPending, onSelect: handlers.onStop },
    { key: "remove", label: "Remove", danger: true, disabled: isPending, onSelect: handlers.onRemove },
  ];
}

function CampaignTypeEditor({ enrollment, onChangeCampaignType }: { enrollment: CrmRetentionEnrollmentRow; onChangeCampaignType: (formData: FormData) => void }) {
  const [editingType, setEditingType] = useState(false);

  if (editingType) {
    return (
      <form
        action={(fd) => {
          onChangeCampaignType(fd);
          setEditingType(false);
        }}
        className="flex items-center gap-1.5"
      >
        <select name="campaign_type" defaultValue={enrollment.campaign_type} className="rounded-lg border border-slate-300 px-2 py-1 text-[12.5px]">
          <option value="client_success">Client Success</option>
          <option value="follow_up">Follow-Up</option>
          <option value="re_engagement">Re-Engagement</option>
        </select>
        <button type="submit" className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">
          Save
        </button>
        <button type="button" onClick={() => setEditingType(false)} className="text-[12px] text-slate-400 hover:text-slate-600">
          ×
        </button>
      </form>
    );
  }
  return (
    <button type="button" onClick={() => setEditingType(true)} className="text-slate-700 hover:underline">
      {RETENTION_CAMPAIGN_LABELS[enrollment.campaign_type]}
    </button>
  );
}

function EnrollmentRow({
  enrollment,
  client,
  lastEmail,
  isPending,
  ...handlers
}: {
  enrollment: CrmRetentionEnrollmentRow;
  client: RetentionClientSummary | undefined;
  lastEmail: CrmRetentionEmailRow | null;
  isPending: boolean;
} & EnrollmentRowHandlers) {
  return (
    <tr>
      <td className="px-3 py-2.5 font-medium text-slate-900">{client?.company_name ?? "Unknown client"}</td>
      <td className="px-3 py-2.5 text-slate-600">{client?.status ?? "—"}</td>
      <td className="px-3 py-2.5">
        <CampaignTypeEditor enrollment={enrollment} onChangeCampaignType={handlers.onChangeCampaignType} />
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge label={RETENTION_STATUS_LABELS[enrollment.retention_status]} className={RETENTION_STATUS_STYLES[enrollment.retention_status]} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600" title={formatDateTime(enrollment.last_sent_at)}>
        {formatCompactDateTime(enrollment.last_sent_at)}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600" title={enrollment.campaign_type === "follow_up" ? undefined : formatDateTime(enrollment.next_send_at)}>
        {enrollment.campaign_type === "follow_up" ? "—" : formatCompactDateTime(enrollment.next_send_at)}
      </td>
      <td className="px-3 py-2.5">
        {lastEmail ? (
          <StatusBadge label={EMAIL_STATUS_LABELS[lastEmail.status as keyof typeof EMAIL_STATUS_LABELS] ?? lastEmail.status} className={EMAIL_STATUS_STYLES[lastEmail.status as keyof typeof EMAIL_STATUS_STYLES] ?? "bg-slate-100 text-slate-600"} />
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="sticky right-0 border-l border-slate-200 bg-white px-3 py-2.5">
        <ManageMenu items={buildManageItems(enrollment, isPending, handlers)} />
      </td>
    </tr>
  );
}

function EnrollmentCard({
  enrollment,
  client,
  lastEmail,
  isPending,
  ...handlers
}: {
  enrollment: CrmRetentionEnrollmentRow;
  client: RetentionClientSummary | undefined;
  lastEmail: CrmRetentionEmailRow | null;
  isPending: boolean;
} & EnrollmentRowHandlers) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-slate-900">{client?.company_name ?? "Unknown client"}</p>
          <div className="mt-1 text-[12.5px]">
            <CampaignTypeEditor enrollment={enrollment} onChangeCampaignType={handlers.onChangeCampaignType} />
          </div>
        </div>
        <ManageMenu items={buildManageItems(enrollment, isPending, handlers)} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge label={RETENTION_STATUS_LABELS[enrollment.retention_status]} className={RETENTION_STATUS_STYLES[enrollment.retention_status]} />
        {lastEmail ? (
          <StatusBadge label={EMAIL_STATUS_LABELS[lastEmail.status as keyof typeof EMAIL_STATUS_LABELS] ?? lastEmail.status} className={EMAIL_STATUS_STYLES[lastEmail.status as keyof typeof EMAIL_STATUS_STYLES] ?? "bg-slate-100 text-slate-600"} />
        ) : (
          <span className="text-[11.5px] text-slate-400">No emails yet</span>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
        <div>
          <span className="font-medium text-slate-600">Status: </span>
          {client?.status ?? "—"}
        </div>
        <div title={formatDateTime(enrollment.last_sent_at)}>
          <span className="font-medium text-slate-600">Last Send: </span>
          {formatCompactDateTime(enrollment.last_sent_at)}
        </div>
        <div className="col-span-2" title={enrollment.campaign_type === "follow_up" ? undefined : formatDateTime(enrollment.next_send_at)}>
          <span className="font-medium text-slate-600">Next Send: </span>
          {enrollment.campaign_type === "follow_up" ? "—" : formatCompactDateTime(enrollment.next_send_at)}
        </div>
      </div>
    </div>
  );
}

function EmailHistoryModal({ emails, clientName, onClose }: { emails: CrmRetentionEmailRow[]; clientName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Email History — {clientName}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {emails.length === 0 && <p className="text-sm text-slate-500">No emails sent yet.</p>}
          {emails.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{e.subject}</span>
                <StatusBadge label={EMAIL_STATUS_LABELS[e.status as keyof typeof EMAIL_STATUS_LABELS] ?? e.status} className={EMAIL_STATUS_STYLES[e.status as keyof typeof EMAIL_STATUS_STYLES] ?? "bg-slate-100 text-slate-600"} />
              </div>
              <div className="mt-1 text-slate-500">
                {formatDateTime(e.created_at)} · to {e.to_email}
                {e.error_detail ? ` · ${e.error_detail}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FollowupPanel({
  clients,
  followups,
  admins,
  isPending,
  runAction,
  actions,
  clientById,
}: {
  clients: RetentionClientSummary[];
  followups: CrmRetentionFollowupRow[];
  admins: AdminOption[];
  isPending: boolean;
  runAction: (action: () => Promise<ActionResult>) => void;
  actions: {
    scheduleFollowup: (formData: FormData) => Promise<ActionResult>;
    resolveFollowup: (followupId: string) => Promise<ActionResult>;
    cancelFollowup: (followupId: string) => Promise<ActionResult>;
    sendFollowupNow: (followupId: string) => Promise<ActionResult>;
  };
  clientById: Map<string, RetentionClientSummary>;
}) {
  const openFollowups = followups.filter((f) => !f.resolved_at && !f.cancelled_at);
  const pastFollowups = followups.filter((f) => f.resolved_at || f.cancelled_at);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="mt-8">
      <h2 className="text-base font-bold text-slate-900">Follow-Up Campaign</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">For clients who asked us to wait or reconnect later. No automatic weekly emails — only the date you choose below.</p>
      <form action={(fd) => runAction(() => actions.scheduleFollowup(fd))} className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-6">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[12px] font-medium text-slate-600">Client *</span>
          <select name="client_id" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Select a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-slate-600">Follow-Up Date *</span>
          <input type="date" name="follow_up_date" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[12px] font-medium text-slate-600">Reason *</span>
          <input type="text" name="follow_up_reason" required placeholder="Asked us to wait until Q1" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-slate-600">Assigned Admin</span>
          <select name="assigned_admin" className={inputClass} defaultValue="">
            <option value="">—</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name || a.email}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-5">
          <span className="text-[12px] font-medium text-slate-600">Internal Note</span>
          <input type="text" name="internal_note" className={inputClass} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" name="auto_send" className="h-4 w-4 rounded border-slate-300" />
          <span className="text-[12.5px] font-medium text-slate-600">Auto Send</span>
        </label>
        <div className="sm:col-span-6">
          <button type="submit" disabled={isPending} className={buttonPrimary}>
            Schedule Follow-Up
          </button>
        </div>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Follow-Up Date</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Assigned Admin</th>
              <th className="px-4 py-3">Auto Send</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {openFollowups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No open follow-ups.
                </td>
              </tr>
            )}
            {openFollowups.map((f) => {
              const isDue = f.follow_up_date <= today;
              return (
                <tr key={f.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{clientById.get(f.client_id)?.company_name ?? "Unknown client"}</td>
                  <td className="px-4 py-3">
                    <span className={isDue ? "font-semibold text-orange-700" : "text-slate-600"}>{formatDate(f.follow_up_date)}</span>
                    {isDue && <span className="ml-1.5 text-[10.5px] font-semibold text-orange-600">DUE</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{f.follow_up_reason}</td>
                  <td className="px-4 py-3 text-slate-600">{admins.find((a) => a.id === f.assigned_admin)?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{f.auto_send ? "On" : "Off"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={isPending} onClick={() => runAction(() => actions.sendFollowupNow(f.id))} className={buttonSubtle}>
                        Send Now
                      </button>
                      <button type="button" disabled={isPending} onClick={() => runAction(() => actions.resolveFollowup(f.id))} className={buttonSubtle}>
                        Resolve
                      </button>
                      <button type="button" disabled={isPending} onClick={() => runAction(() => actions.cancelFollowup(f.id))} className={buttonDanger}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pastFollowups.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-500">Past follow-ups ({pastFollowups.length})</summary>
          <div className="mt-2 space-y-1.5">
            {pastFollowups.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600">
                {clientById.get(f.client_id)?.company_name ?? "Unknown client"} — {formatDate(f.follow_up_date)} — {f.resolved_at ? "Resolved" : "Cancelled"}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function TemplatesPanel({
  templates,
  isPending,
  runAction,
  actions,
}: {
  templates: CrmRetentionTemplateRow[];
  isPending: boolean;
  runAction: (action: () => Promise<ActionResult>) => void;
  actions: {
    updateTemplate: (templateId: string, formData: FormData) => Promise<ActionResult>;
    restoreDefaultTemplate: (templateId: string, subject: string, body: string) => Promise<ActionResult>;
    sendTestEmail: (templateId: string, toEmail: string) => Promise<ActionResult>;
  };
}) {
  const grouped: Record<RetentionCampaignType, CrmRetentionTemplateRow[]> = { client_success: [], follow_up: [], re_engagement: [] };
  for (const t of templates) grouped[t.campaign_type]?.push(t);

  return (
    <section className="mt-8">
      <h2 className="text-base font-bold text-slate-900">Email Templates</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">Uses {"{{first_name}}"} and {"{{business_name}}"} — never a hard-coded client name.</p>
      {(Object.keys(grouped) as RetentionCampaignType[]).map((campaignType) => (
        <div key={campaignType} className="mt-4">
          <h3 className="text-[13px] font-bold text-slate-700">{RETENTION_CAMPAIGN_LABELS[campaignType]}</h3>
          <div className="mt-2 space-y-3">
            {grouped[campaignType].map((template) => (
              <TemplateCard key={template.id} template={template} isPending={isPending} runAction={runAction} actions={actions} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function TemplateCard({
  template,
  isPending,
  runAction,
  actions,
}: {
  template: CrmRetentionTemplateRow;
  isPending: boolean;
  runAction: (action: () => Promise<ActionResult>) => void;
  actions: {
    updateTemplate: (templateId: string, formData: FormData) => Promise<ActionResult>;
    restoreDefaultTemplate: (templateId: string, subject: string, body: string) => Promise<ActionResult>;
    sendTestEmail: (templateId: string, toEmail: string) => Promise<ActionResult>;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const [testRecipient, setTestRecipient] = useState<string>(RETENTION_TEST_EMAIL_RECIPIENTS[0].email);
  const defaults = DEFAULT_TEMPLATE_TEXT[`${template.campaign_type}:${template.sequence_number}`];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-[13px] font-semibold text-slate-800">{template.label}</span>
        <span className="text-[12px] text-slate-400">{expanded ? "Hide" : "Edit"}</span>
      </button>
      {expanded && (
        <div className="mt-3">
          <form action={(fd) => runAction(() => actions.updateTemplate(template.id, fd))} className="grid grid-cols-1 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Subject</span>
              <input type="text" name="subject" defaultValue={template.subject} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Body</span>
              <textarea name="body" rows={5} defaultValue={template.body} className={inputClass} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={isPending} className={buttonPrimary}>
                Save Template
              </button>
              {defaults && (
                <button type="button" disabled={isPending} onClick={() => runAction(() => actions.restoreDefaultTemplate(template.id, defaults.subject, defaults.body))} className={buttonSubtle}>
                  Restore Default
                </button>
              )}
            </div>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <select value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-[12.5px]">
              {RETENTION_TEST_EMAIL_RECIPIENTS.map((r) => (
                <option key={r.email} value={r.email}>
                  {r.label}
                </option>
              ))}
            </select>
            <button type="button" disabled={isPending} onClick={() => runAction(() => actions.sendTestEmail(template.id, testRecipient))} className={buttonSubtle}>
              Send Test Email
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
