import { Phone, PhoneCall, Mail, Send, Percent, CheckCircle2, XCircle, UserCheck, CalendarCheck } from "lucide-react";
import KpiCard from "@/components/crm-ui/KpiCard";
import type { LeadgenTeamActivityKpis } from "@/lib/leadgen-agent-kpi";
import type { CallLogCardRecord, EmailCardRecord } from "@/lib/leadgen-activity-records";
import type { LeadCardRecord, AppointmentCardRecord } from "@/lib/leadgen-dashboard-records";
import LeadgenCallLogRecordsModal from "./LeadgenCallLogRecordsModal";
import LeadgenEmailRecordsModal from "./LeadgenEmailRecordsModal";
import LeadgenLeadRecordsModal from "./LeadgenLeadRecordsModal";
import LeadgenAppointmentRecordsModal from "./LeadgenAppointmentRecordsModal";

type ActionResult = { error?: string } | void;

// Admin-only team-wide rollup, shown once above the per-agent
// AgentActivityKpiSection cards. Every number here is a straight sum of
// the same per-agent snapshots those cards already show (see
// computeLeadgenTeamActivityKpis) - including the delivery rate, which is
// computed from the combined delivered/sent totals rather than averaging
// each agent's own percentage, so it can never disagree with "add up the
// two agents' cards yourself". Every count card is clickable, driven from
// the exact same team-wide records arrays the per-agent cards' own records
// are drawn from (same rule as every other CrmCardModal-based card: the
// number can never disagree with what clicking it shows).
export default function TeamActivityKpiSection({
  team,
  interestedLeadRecords,
  appointmentsBookedRecords,
  callsTodayRecords,
  callsThisWeekRecords,
  emailsTodayRecords,
  emailsThisWeekRecords,
  deliveredThisWeekRecords,
  bouncedThisWeekRecords,
  failedThisWeekRecords,
  callLogHref,
  emailsHref,
  leadHrefBase,
  appointmentsHref,
  onAddNote,
  onCompleteFollowUp,
  onScheduleFollowUp,
}: {
  team: LeadgenTeamActivityKpis;
  interestedLeadRecords: LeadCardRecord[];
  appointmentsBookedRecords: AppointmentCardRecord[];
  callsTodayRecords: CallLogCardRecord[];
  callsThisWeekRecords: CallLogCardRecord[];
  emailsTodayRecords: EmailCardRecord[];
  emailsThisWeekRecords: EmailCardRecord[];
  deliveredThisWeekRecords: EmailCardRecord[];
  bouncedThisWeekRecords: EmailCardRecord[];
  failedThisWeekRecords: EmailCardRecord[];
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
      <h3 className="text-base font-bold text-slate-900">Team Totals</h3>
      <p className="mt-1 text-sm text-slate-500">
        Across {team.agentCount} active agent{team.agentCount === 1 ? "" : "s"}.
      </p>

      <h4 className="mt-4 text-sm font-semibold uppercase tracking-wide text-sky-700">Activity</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LeadgenCallLogRecordsModal
          label="Team Calls Today"
          tone="blue"
          icon={<Phone />}
          records={callsTodayRecords}
          callLogHref={callLogHref}
          emptyMessage="No calls logged today yet."
          valueLabel={`${callsTodayRecords.length}/${team.dailyCallGoal}`}
        />
        <LeadgenCallLogRecordsModal
          label="Team Calls This Week"
          tone="indigo"
          icon={<PhoneCall />}
          records={callsThisWeekRecords}
          callLogHref={callLogHref}
          emptyMessage="No calls logged this week yet."
          valueLabel={`${callsThisWeekRecords.length}/${team.weeklyCallGoal}`}
        />
        <LeadgenEmailRecordsModal
          label="Team Emails Today"
          tone="teal"
          icon={<Mail />}
          records={emailsTodayRecords}
          emailsHref={emailsHref}
          emptyMessage="No emails sent today yet."
          valueLabel={`${emailsTodayRecords.length}/${team.dailyEmailGoal}`}
        />
        <LeadgenEmailRecordsModal
          label="Team Emails This Week"
          tone="cyan"
          icon={<Send />}
          records={emailsThisWeekRecords}
          emailsHref={emailsHref}
          emptyMessage="No emails sent this week yet."
          valueLabel={`${emailsThisWeekRecords.length}/${team.weeklyEmailGoal}`}
        />
        <KpiCard
          label="Team Email Delivery Rate"
          value={team.teamEmailDeliveryRatePct === null ? "—" : `${team.teamEmailDeliveryRatePct}%`}
          icon={<Percent />}
          tone="green"
        />
        <LeadgenEmailRecordsModal
          label="Total Delivered (Week)"
          tone="green"
          icon={<CheckCircle2 />}
          records={deliveredThisWeekRecords}
          emailsHref={emailsHref}
          emptyMessage="No delivered emails this week yet."
        />
        <LeadgenEmailRecordsModal
          label="Total Bounced (Week)"
          tone="red"
          icon={<XCircle />}
          records={bouncedThisWeekRecords}
          emailsHref={emailsHref}
          emptyMessage="No bounced emails this week."
        />
        <LeadgenEmailRecordsModal
          label="Total Failed (Week)"
          tone="red"
          icon={<XCircle />}
          records={failedThisWeekRecords}
          emailsHref={emailsHref}
          emptyMessage="No failed emails this week."
        />
      </div>

      <h4 className="mt-5 text-sm font-semibold uppercase tracking-wide text-emerald-700">Results</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LeadgenLeadRecordsModal
          label="Total Interested Leads"
          tone="purple"
          icon={<UserCheck />}
          records={interestedLeadRecords}
          leadHrefBase={leadHrefBase}
          emptyMessage="No interested leads right now."
          onAddNote={onAddNote}
          onCompleteFollowUp={onCompleteFollowUp}
          onScheduleFollowUp={onScheduleFollowUp}
        />
        <LeadgenAppointmentRecordsModal
          label="Total Appointments Booked (Week)"
          tone="orange"
          icon={<CalendarCheck />}
          records={appointmentsBookedRecords}
          leadHrefBase={leadHrefBase}
          appointmentsHref={appointmentsHref}
        />
      </div>
    </section>
  );
}
