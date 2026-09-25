import { Phone, PhoneCall, Mail, Send, Percent, CheckCircle2, XCircle, UserCheck, CalendarCheck } from "lucide-react";
import KpiCard from "@/components/crm-ui/KpiCard";
import type { LeadgenTeamActivityKpis } from "@/lib/leadgen-agent-kpi";

// Admin-only team-wide rollup, shown once above the per-agent
// AgentActivityKpiSection cards. Every number here is a straight sum of
// the same per-agent snapshots those cards already show (see
// computeLeadgenTeamActivityKpis) - including the delivery rate, which is
// computed from the combined delivered/sent totals rather than averaging
// each agent's own percentage, so it can never disagree with "add up the
// two agents' cards yourself".
export default function TeamActivityKpiSection({
  team,
  totalInterestedLeads,
  totalAppointmentsBookedThisWeek,
}: {
  team: LeadgenTeamActivityKpis;
  totalInterestedLeads: number;
  totalAppointmentsBookedThisWeek: number;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h3 className="text-[15px] font-bold text-slate-900">Team Totals</h3>
      <p className="mt-1 text-[12.5px] text-slate-500">
        Across {team.agentCount} active agent{team.agentCount === 1 ? "" : "s"}.
      </p>

      <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-sky-700">Activity</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Team Calls Today" value={`${team.callsToday}/${team.dailyCallGoal}`} icon={<Phone />} tone="blue" />
        <KpiCard label="Team Calls This Week" value={`${team.callsThisWeek}/${team.weeklyCallGoal}`} icon={<PhoneCall />} tone="indigo" />
        <KpiCard label="Team Emails Today" value={`${team.emailsToday}/${team.dailyEmailGoal}`} icon={<Mail />} tone="teal" />
        <KpiCard label="Team Emails This Week" value={`${team.emailsThisWeek}/${team.weeklyEmailGoal}`} icon={<Send />} tone="cyan" />
        <KpiCard
          label="Team Email Delivery Rate"
          value={team.teamEmailDeliveryRatePct === null ? "—" : `${team.teamEmailDeliveryRatePct}%`}
          icon={<Percent />}
          tone="green"
        />
        <KpiCard label="Total Delivered (Week)" value={team.deliveredThisWeek} icon={<CheckCircle2 />} tone="green" />
        <KpiCard label="Total Bounced (Week)" value={team.bouncedThisWeek} icon={<XCircle />} tone="red" />
        <KpiCard label="Total Failed (Week)" value={team.failedThisWeek} icon={<XCircle />} tone="red" />
      </div>

      <h4 className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Results</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Interested Leads" value={totalInterestedLeads} icon={<UserCheck />} tone="purple" />
        <KpiCard label="Total Appointments Booked (Week)" value={totalAppointmentsBookedThisWeek} icon={<CalendarCheck />} tone="orange" />
      </div>
    </section>
  );
}
