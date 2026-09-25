import { Phone, PhoneCall, Mail, Send, XCircle, Percent, UserCheck, CalendarCheck, ListChecks } from "lucide-react";
import KpiCard from "@/components/crm-ui/KpiCard";
import {
  LEADGEN_DAILY_CALL_TARGET,
  LEADGEN_DAILY_EMAIL_TARGET,
  LEADGEN_WEEKLY_CALL_TARGET,
  LEADGEN_WEEKLY_EMAIL_TARGET,
  type LeadgenAgentActivityKpis,
} from "@/lib/leadgen-agent-kpi";

// One agent's compact KPI section - Calls/Emails/Follow-Ups (Activity)
// clearly separated from Interested Leads/Appointments Booked (Results),
// per the brief's "do not let high email volume alone produce a misleading
// overall performance result". Used both on an agent's own Performance page
// (agentName omitted - the page's own heading already says whose it is)
// and once per agent on the admin Performance page (agentName shown).
export default function AgentActivityKpiSection({
  agentName,
  kpis,
  interestedLeads,
  appointmentsBookedThisWeek,
  appointmentsWeeklyTarget,
}: {
  agentName?: string;
  kpis: LeadgenAgentActivityKpis;
  interestedLeads: number;
  appointmentsBookedThisWeek: number;
  appointmentsWeeklyTarget: number;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      {agentName && <h3 className="text-[15px] font-bold text-slate-900">{agentName}</h3>}

      <h4 className={`text-[11px] font-semibold uppercase tracking-wide text-sky-700 ${agentName ? "mt-3" : ""}`}>Activity</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Calls Today" value={`${kpis.callsToday}/${LEADGEN_DAILY_CALL_TARGET}`} icon={<Phone />} tone="blue" />
        <MiniStat label="Calls Remaining Today" value={String(kpis.callsRemainingToday)} />
        <MiniStat label="Daily Call Progress" value={`${kpis.dailyCallProgressPct}%`} />
        <KpiCard label="Calls This Week" value={`${kpis.callsThisWeek}/${LEADGEN_WEEKLY_CALL_TARGET}`} icon={<PhoneCall />} tone="indigo" />
        <MiniStat label="Weekly Call Progress" value={`${kpis.weeklyCallProgressPct}%`} />
        <KpiCard label="Emails Today" value={`${kpis.emailsToday}/${LEADGEN_DAILY_EMAIL_TARGET}`} icon={<Mail />} tone="teal" />
        <MiniStat label="Emails Remaining Today" value={String(kpis.emailsRemainingToday)} />
        <KpiCard label="Emails This Week" value={`${kpis.emailsThisWeek}/${LEADGEN_WEEKLY_EMAIL_TARGET}`} icon={<Send />} tone="cyan" />
        <MiniStat label="Weekly Email Progress" value={`${kpis.weeklyEmailProgressPct}%`} />
        <KpiCard label="Email Delivery Rate" value={kpis.emailDeliveryRatePct === null ? "—" : `${kpis.emailDeliveryRatePct}%`} icon={<Percent />} tone="green" />
        <MiniStat label="Delivered Emails (Week)" value={String(kpis.deliveredThisWeek)} />
        <MiniStat label="Bounced Emails (Week)" value={String(kpis.bouncedThisWeek)} icon={<XCircle className="h-3.5 w-3.5" />} />
        <MiniStat label="Failed Emails (Week)" value={String(kpis.failedThisWeek)} icon={<XCircle className="h-3.5 w-3.5" />} />
        <MiniStat label="Follow-Ups Completed (Week)" value={String(kpis.followUpsCompletedThisWeek)} icon={<ListChecks className="h-3.5 w-3.5" />} />
      </div>

      <h4 className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Results</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Interested Leads" value={interestedLeads} icon={<UserCheck />} tone="purple" />
        <KpiCard
          label="Appointments Booked (Week)"
          value={`${appointmentsBookedThisWeek}/${appointmentsWeeklyTarget}`}
          icon={<CalendarCheck />}
          tone="orange"
        />
      </div>
    </section>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-white p-4">
      {icon && <span className="mb-1 text-slate-400">{icon}</span>}
      <div className="text-[20px] font-extrabold leading-none tracking-tight text-slate-900">{value}</div>
      <div className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
