import { Phone, PhoneCall, Mail, Send, XCircle, Percent, UserCheck, CalendarCheck, ListChecks } from "lucide-react";
import KpiCard from "@/components/crm-ui/KpiCard";
import {
  LEADGEN_DAILY_CALL_TARGET,
  LEADGEN_DAILY_EMAIL_TARGET,
  LEADGEN_WEEKLY_CALL_TARGET,
  LEADGEN_WEEKLY_EMAIL_TARGET,
  type LeadgenAgentActivityKpis,
} from "@/lib/leadgen-agent-kpi";
import type { CallLogCardRecord, EmailCardRecord, FollowUpCompletedCardRecord } from "@/lib/leadgen-activity-records";
import type { LeadCardRecord, AppointmentCardRecord } from "@/lib/leadgen-dashboard-records";
import LeadgenCallLogRecordsModal from "./LeadgenCallLogRecordsModal";
import LeadgenEmailRecordsModal from "./LeadgenEmailRecordsModal";
import LeadgenFollowUpCompletedRecordsModal from "./LeadgenFollowUpCompletedRecordsModal";
import LeadgenLeadRecordsModal from "./LeadgenLeadRecordsModal";
import LeadgenAppointmentRecordsModal from "./LeadgenAppointmentRecordsModal";

type ActionResult = { error?: string } | void;

// One agent's compact KPI section - Calls/Emails/Follow-Ups (Activity)
// clearly separated from Interested Leads/Appointments Booked (Results),
// per the brief's "do not let high email volume alone produce a misleading
// overall performance result". Used both on an agent's own Performance page
// (agentName omitted - the page's own heading already says whose it is)
// and once per agent on the admin Performance page (agentName shown).
//
// Every count card here is clickable, opening the same drill-down modal
// pattern already used on the main dashboards (CrmCardModal) - each card's
// displayed number is always `records.length` of the exact array shown
// inside its own modal, so a number can never disagree with what clicking
// it reveals. Percentage/progress cards (Daily Call Progress, Email
// Delivery Rate, etc.) stay plain - there is no separate record list behind
// a percentage.
export default function AgentActivityKpiSection({
  agentName,
  kpis,
  interestedLeadRecords,
  appointmentsBookedRecords,
  appointmentsWeeklyTarget,
  callsTodayRecords,
  callsThisWeekRecords,
  emailsTodayRecords,
  emailsThisWeekRecords,
  deliveredThisWeekRecords,
  bouncedThisWeekRecords,
  failedThisWeekRecords,
  followUpsCompletedRecords,
  callLogHref,
  emailsHref,
  leadHrefBase,
  appointmentsHref,
  onAddNote,
  onCompleteFollowUp,
  onScheduleFollowUp,
}: {
  agentName?: string;
  kpis: LeadgenAgentActivityKpis;
  interestedLeadRecords: LeadCardRecord[];
  appointmentsBookedRecords: AppointmentCardRecord[];
  appointmentsWeeklyTarget: number;
  callsTodayRecords: CallLogCardRecord[];
  callsThisWeekRecords: CallLogCardRecord[];
  emailsTodayRecords: EmailCardRecord[];
  emailsThisWeekRecords: EmailCardRecord[];
  deliveredThisWeekRecords: EmailCardRecord[];
  bouncedThisWeekRecords: EmailCardRecord[];
  failedThisWeekRecords: EmailCardRecord[];
  followUpsCompletedRecords: FollowUpCompletedCardRecord[];
  callLogHref: string;
  emailsHref: string;
  leadHrefBase: string;
  appointmentsHref: string;
  onAddNote: (leadId: string, note: string) => Promise<{ error?: string }>;
  onCompleteFollowUp?: (followUpId: string, leadId: string) => Promise<ActionResult>;
  onScheduleFollowUp?: (leadId: string, formData: FormData) => Promise<ActionResult>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      {agentName && <h3 className="text-base font-bold text-slate-900">{agentName}</h3>}

      <h4 className={`text-sm font-semibold uppercase tracking-wide text-sky-700 ${agentName ? "mt-3" : ""}`}>Activity</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LeadgenCallLogRecordsModal
          label="Calls Today"
          tone="blue"
          icon={<Phone />}
          records={callsTodayRecords}
          callLogHref={callLogHref}
          emptyMessage="No calls logged today yet."
          valueLabel={`${callsTodayRecords.length}/${LEADGEN_DAILY_CALL_TARGET}`}
        />
        <MiniStat label="Calls Remaining Today" value={String(kpis.callsRemainingToday)} />
        <MiniStat label="Daily Call Progress" value={`${kpis.dailyCallProgressPct}%`} />
        <LeadgenCallLogRecordsModal
          label="Calls This Week"
          tone="indigo"
          icon={<PhoneCall />}
          records={callsThisWeekRecords}
          callLogHref={callLogHref}
          emptyMessage="No calls logged this week yet."
          valueLabel={`${callsThisWeekRecords.length}/${LEADGEN_WEEKLY_CALL_TARGET}`}
        />
        <MiniStat label="Weekly Call Progress" value={`${kpis.weeklyCallProgressPct}%`} />
        <LeadgenEmailRecordsModal
          label="Emails Today"
          tone="teal"
          icon={<Mail />}
          records={emailsTodayRecords}
          emailsHref={emailsHref}
          emptyMessage="No emails sent today yet."
          valueLabel={`${emailsTodayRecords.length}/${LEADGEN_DAILY_EMAIL_TARGET}`}
        />
        <MiniStat label="Emails Remaining Today" value={String(kpis.emailsRemainingToday)} />
        <LeadgenEmailRecordsModal
          label="Emails This Week"
          tone="cyan"
          icon={<Send />}
          records={emailsThisWeekRecords}
          emailsHref={emailsHref}
          emptyMessage="No emails sent this week yet."
          valueLabel={`${emailsThisWeekRecords.length}/${LEADGEN_WEEKLY_EMAIL_TARGET}`}
        />
        <MiniStat label="Weekly Email Progress" value={`${kpis.weeklyEmailProgressPct}%`} />
        <KpiCard label="Email Delivery Rate" value={kpis.emailDeliveryRatePct === null ? "—" : `${kpis.emailDeliveryRatePct}%`} icon={<Percent />} tone="green" />
        <LeadgenEmailRecordsModal
          label="Delivered Emails (Week)"
          tone="green"
          icon={<Mail />}
          records={deliveredThisWeekRecords}
          emailsHref={emailsHref}
          emptyMessage="No delivered emails this week yet."
        />
        <LeadgenEmailRecordsModal
          label="Bounced Emails (Week)"
          tone="red"
          icon={<XCircle />}
          records={bouncedThisWeekRecords}
          emailsHref={emailsHref}
          emptyMessage="No bounced emails this week."
        />
        <LeadgenEmailRecordsModal
          label="Failed Emails (Week)"
          tone="red"
          icon={<XCircle />}
          records={failedThisWeekRecords}
          emailsHref={emailsHref}
          emptyMessage="No failed emails this week."
        />
        <LeadgenFollowUpCompletedRecordsModal
          label="Follow-Ups Completed (Week)"
          tone="slate"
          icon={<ListChecks />}
          records={followUpsCompletedRecords}
        />
      </div>

      <h4 className="mt-5 text-sm font-semibold uppercase tracking-wide text-emerald-700">Results</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LeadgenLeadRecordsModal
          label="Interested Leads"
          tone="purple"
          icon={<UserCheck />}
          records={interestedLeadRecords}
          leadHrefBase={leadHrefBase}
          onAddNote={onAddNote}
          onCompleteFollowUp={onCompleteFollowUp}
          onScheduleFollowUp={onScheduleFollowUp}
        />
        <LeadgenAppointmentRecordsModalWithTarget
          appointmentsWeeklyTarget={appointmentsWeeklyTarget}
          records={appointmentsBookedRecords}
          leadHrefBase={leadHrefBase}
          appointmentsHref={appointmentsHref}
        />
      </div>
    </section>
  );
}

// "Appointments Booked (Week)" keeps its original `n/target` display via
// LeadgenAppointmentRecordsModal's `valueLabel` override, while the modal's
// row list (and the number's numerator) both come from the same `records`
// array passed in.
function LeadgenAppointmentRecordsModalWithTarget({
  appointmentsWeeklyTarget,
  records,
  leadHrefBase,
  appointmentsHref,
}: {
  appointmentsWeeklyTarget: number;
  records: AppointmentCardRecord[];
  leadHrefBase: string;
  appointmentsHref: string;
}) {
  return (
    <LeadgenAppointmentRecordsModal
      label="Appointments Booked (Week)"
      tone="orange"
      icon={<CalendarCheck />}
      records={records}
      leadHrefBase={leadHrefBase}
      appointmentsHref={appointmentsHref}
      valueLabel={`${records.length}/${appointmentsWeeklyTarget}`}
    />
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-white p-4">
      {icon && <span className="mb-1 text-slate-400">{icon}</span>}
      <div className="text-[20px] font-extrabold leading-none tracking-tight text-slate-900">{value}</div>
      <div className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
