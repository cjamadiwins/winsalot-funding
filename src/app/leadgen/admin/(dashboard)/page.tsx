import Link from "next/link";
import { Users, UserCheck, CalendarCheck, Clock, AlertTriangle, UserPlus, CalendarPlus, BarChart3, Flame, Gauge, Snowflake, CalendarClock, Trophy } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { LEADGEN_STAT_CARD_STYLES, isLeadgenAppointmentCountable, isLeadgenNextFollowUpDueToday, isLeadgenNextFollowUpOverdue } from "@/lib/leadgen-types";
import { computeLeadgenDashboardTrends } from "@/lib/leadgen-dashboard-trends";
import { leadgenDateKey } from "@/lib/leadgen-performance";
import KpiCard from "@/components/crm-ui/KpiCard";
import ResultsByAgentChart from "./ResultsByAgentChart";
import TodaysAppointmentsCard, { type TodaysAppointmentRow } from "./TodaysAppointmentsCard";
import DialpadDashboardPreview from "@/components/dialpad/DialpadDashboardPreview";
import { loadDialpadDashboardData } from "@/lib/dialpad-report-data";
import { effectiveOpportunityCategory, OPPORTUNITY_CATEGORY_KPI_TONE } from "@/lib/opportunity-finder";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenAdminDashboardPage() {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const now = new Date();
  const todayKey = leadgenDateKey(now);

  const [{ data: leads }, { data: appointments }, { data: clients }, { data: users }, { data: campaigns }, { data: todaysAppointments }, { data: opportunityScores }] =
    await Promise.all([
      admin.from("leadgen_leads").select("id, business_name, status, client_id, campaign_id, assigned_agent_id, next_follow_up_at, created_at"),
      admin.from("leadgen_appointments").select("status, client_id, lead_id"),
      admin.from("leadgen_clients").select("id, name"),
      admin
        .from("leadgen_users")
        .select("id, full_name, role, current_campaign_id")
        .eq("role", "agent")
        .eq("active", true)
        .neq("email", DEACTIVATED_TEST_AGENT_EMAIL),
      admin.from("leadgen_campaigns").select("id, name"),
      // Today's Appointments dashboard widget - every non-cancelled/replaced
      // appointment booked for today, earliest first.
      admin
        .from("leadgen_appointments")
        .select("id, appointment_time, business_name, contact_name, status, assigned_specialist_id, lead_id")
        .eq("appointment_date", todayKey)
        .order("appointment_time", { ascending: true }),
      // Opportunity Finder counters, below - one lightweight read of the
      // scoring table (supabase/migrations/0113).
      admin.from("leadgen_opportunity_scores").select("lead_id, category, priority_override, finder_state"),
    ]);

  const allLeads = leads ?? [];
  const allAppointments = appointments ?? [];
  const allClients = clients ?? [];
  const agents = users ?? [];
  const campaignNameById = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign.name] as const));

  const totalLeads = allLeads.length;
  const interestedLeads = allLeads.filter((l) => l.status === "Interested").length;
  // Cancelled/Replaced appointments (isLeadgenAppointmentCountable,
  // leadgen-types.ts) never count toward the total - a corrected
  // duplicate (see the "Cancel/Replace Appointment" admin action) counts
  // once, via the appointment that replaced it, not twice.
  const countableAppointments = allAppointments.filter((a) => isLeadgenAppointmentCountable(a.status));
  const appointmentsBooked = countableAppointments.length;
  // Same source of truth as the Leads page's Due Today/Overdue filters
  // (LeadsListClient.tsx) - each lead's own next_follow_up_at, not a raw
  // scan of leadgen_followups rows, so these counts can never drift out
  // of sync with what clicking through to the Leads page actually shows.
  const followUpsDueToday = allLeads.filter((l) => isLeadgenNextFollowUpDueToday(l.next_follow_up_at)).length;
  const overdueFollowUps = allLeads.filter((l) => isLeadgenNextFollowUpOverdue(l.next_follow_up_at)).length;

  const trends = computeLeadgenDashboardTrends(allLeads, now);

  // Opportunity Finder counters.
  const leadNextFollowUpById = new Map(allLeads.map((l) => [l.id, l.next_follow_up_at] as const));
  const opportunityScoreCounts = { high: 0, medium: 0, low: 0, followUpsDue: 0 };
  for (const raw of opportunityScores ?? []) {
    const effective = effectiveOpportunityCategory(raw as { category: "high" | "medium" | "low" | "closed"; priority_override: "high" | "medium" | "low" | null; finder_state: "active" | "dismissed" });
    if (effective === "high") opportunityScoreCounts.high += 1;
    else if (effective === "medium") opportunityScoreCounts.medium += 1;
    else if (effective === "low") opportunityScoreCounts.low += 1;
    const nextFollowUpAt = leadNextFollowUpById.get(raw.lead_id);
    if (nextFollowUpAt && new Date(nextFollowUpAt).getTime() <= now.getTime()) opportunityScoreCounts.followUpsDue += 1;
  }
  const convertedLeadIds = new Set((allAppointments as { status: string; lead_id?: string | null }[]).filter((a) => a.status === "Completed" && a.lead_id).map((a) => a.lead_id as string));
  const convertedCount = convertedLeadIds.size;

  const byCampaignClient = new Map<string, { name: string; leads: number; appointments: number }>();
  for (const client of allClients) byCampaignClient.set(client.id, { name: client.name, leads: 0, appointments: 0 });
  for (const lead of allLeads) {
    const entry = byCampaignClient.get(lead.client_id);
    if (entry) entry.leads++;
  }
  for (const appt of countableAppointments) {
    const entry = byCampaignClient.get(appt.client_id);
    if (entry) entry.appointments++;
  }

  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.full_name] as const));
  const todaysAppointmentRows: TodaysAppointmentRow[] = (todaysAppointments ?? [])
    .filter((appt) => isLeadgenAppointmentCountable(appt.status))
    .map((appt) => ({
      id: appt.id,
      appointment_time: appt.appointment_time,
      business_name: appt.business_name,
      contact_name: appt.contact_name,
      status: appt.status,
      agentName: appt.assigned_specialist_id ? (agentNameById.get(appt.assigned_specialist_id) ?? null) : null,
      lead_id: appt.lead_id,
    }));

  const dialpadData = await loadDialpadDashboardData(admin);

  // Each card links straight into the Leads page pre-filtered to that
  // exact slice (see LeadsListClient's initialStatusFilter/
  // initialFollowUpFilter props), so clicking a number is never a dead
  // end - every row on the landed page already links to that lead's own
  // profile, where the admin can act immediately.
  const stats = [
    {
      label: "Total Leads",
      value: String(totalLeads),
      href: "/leadgen/admin/leads",
      tone: LEADGEN_STAT_CARD_STYLES.leads,
      icon: Users,
      trend: trends.totalLeads,
    },
    {
      label: "Interested Leads",
      value: String(interestedLeads),
      href: "/leadgen/admin/leads?status=Interested",
      tone: LEADGEN_STAT_CARD_STYLES.interested,
      icon: UserCheck,
      trend: trends.interestedLeads,
    },
    {
      label: "Appointments Booked",
      value: String(appointmentsBooked),
      // Filters by the appointment record's own status (source of
      // truth), not the lead's main status - a lead whose appointment is
      // genuinely Booked must show up here even if its main status
      // hasn't caught up (e.g. still "Consultation Information Sent").
      // See LeadsListClient's appointmentStatusFilter.
      href: `/leadgen/admin/leads?appointment_status=${encodeURIComponent("Booked")}`,
      tone: LEADGEN_STAT_CARD_STYLES.appointments,
      icon: CalendarCheck,
      trend: trends.appointmentsBooked,
    },
    {
      label: "Follow-ups Due Today",
      value: String(followUpsDueToday),
      href: "/leadgen/admin/leads?followup=due_today",
      tone: LEADGEN_STAT_CARD_STYLES.dueToday,
      icon: Clock,
      trend: trends.followUpsDue,
    },
    {
      label: "Overdue Follow-ups",
      value: String(overdueFollowUps),
      href: "/leadgen/admin/leads?followup=overdue",
      tone: LEADGEN_STAT_CARD_STYLES.overdue,
      icon: AlertTriangle,
      // Rising overdue count is bad, not good - flip the arrow's color
      // logic so an "up" trend reads red, not green.
      trend: { ...trends.overdueFollowUps, goodDirection: "down" as const },
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Good afternoon, Winsalot Corp.
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening across every client and campaign today.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/leadgen/admin/leads"
            className="flex items-center gap-2 rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)]"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2.3} />
            Add Lead
          </Link>
          <Link
            href="/leadgen/admin/appointments"
            className="flex items-center gap-2 rounded-[11px] border-[1.5px] border-[var(--crm-accent,#3e7ef7)]/30 bg-white px-4 py-2.5 text-[13.5px] font-bold text-[var(--crm-accent,#3e7ef7)] transition hover:bg-[var(--crm-bg-2,#eaf0f6)]"
          >
            <CalendarPlus className="h-4 w-4" strokeWidth={2.3} />
            Book Appointment
          </Link>
          <Link
            href="/leadgen/admin/performance"
            className="flex items-center gap-2 rounded-[11px] bg-teal-600 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-teal-700"
          >
            <BarChart3 className="h-4 w-4" strokeWidth={2.3} />
            View Reports
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <KpiCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            href={stat.href}
            tone={stat.tone}
            icon={<stat.icon />}
            trend={stat.trend}
          />
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-700">Agent Campaign Status</h2>
        <p className="mt-1 text-[13px] text-slate-500">Each active agent&apos;s currently selected campaign.</p>
        {agents.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No active agents.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {agents.map((agent) => {
              const campaignName = agent.current_campaign_id ? campaignNameById.get(agent.current_campaign_id) : null;
              return (
                <div key={agent.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="text-[13.5px] font-semibold text-slate-800">{agent.full_name}</span>
                  <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${campaignName ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                    {campaignName ?? "Not selected"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <h2 className="mt-6 text-lg font-bold text-slate-900">Opportunity Finder</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="High Opportunities" value={opportunityScoreCounts.high} icon={<Flame />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.high} href="/leadgen/admin/opportunity-finder?category=high" />
        <KpiCard label="Medium Opportunities" value={opportunityScoreCounts.medium} icon={<Gauge />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.medium} href="/leadgen/admin/opportunity-finder?category=medium" />
        <KpiCard label="Low Opportunities" value={opportunityScoreCounts.low} icon={<Snowflake />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.low} href="/leadgen/admin/opportunity-finder?category=low" />
        <KpiCard label="Follow-Ups Due" value={opportunityScoreCounts.followUpsDue} icon={<CalendarClock />} tone="orange" href="/leadgen/admin/opportunity-finder?followup=due" />
        <KpiCard label="Opportunities Converted" value={convertedCount} icon={<Trophy />} tone="green" href="/leadgen/admin/opportunity-finder?category=closed" />
      </div>

      <DialpadDashboardPreview
        audience="admin"
        report={dialpadData.selectedReport}
        summaries={dialpadData.summaries}
        fullReportHref="/leadgen/admin/dialpad"
      />

      <section className="mt-8 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-purple-700">Results by Client</h2>
        {byCampaignClient.size === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No clients yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2">Client</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Appointments</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byCampaignClient.entries()).map(([id, row]) => (
                <tr key={id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link
                      href={`/leadgen/admin/clients/${id}`}
                      className="font-medium text-sky-600 hover:text-sky-700"
                      title={`Open the ${row.name} campaign dashboard`}
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/leadgen/admin/leads?client=${id}`} className="text-slate-700 hover:text-sky-600 hover:underline">
                      {row.leads}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/leadgen/admin/appointments?client=${id}`} className="text-slate-700 hover:text-sky-600 hover:underline">
                      {row.appointments}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-[1.6] rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-green-700">Agent Performance</h2>
          <ResultsByAgentChart agents={agents} leads={allLeads} serverNowIso={now.toISOString()} />
        </section>

        <div className="flex-1">
          <TodaysAppointmentsCard appointments={todaysAppointmentRows} />
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Training</h2>
        <p className="mt-2 text-[13.5px] text-slate-600">
          Open the correct client call script before dialing to stay consistent on every campaign.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/leadgen/admin/training#mantra-collab" className="text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
            Open Mantra Collab Training
          </Link>
          <Link href="/leadgen/admin/training#brents-essentials" className="text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
            Open Brent&apos;s Essentials Training
          </Link>
        </div>
      </section>
    </div>
  );
}
