import Link from "next/link";
import { Users, UserCheck, CalendarCheck, Clock, AlertTriangle } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { LEADGEN_STAT_CARD_STYLES, isLeadgenNextFollowUpDueToday, isLeadgenNextFollowUpOverdue } from "@/lib/leadgen-types";
import KpiCard from "@/components/crm-ui/KpiCard";
import ResultsByAgentChart from "./ResultsByAgentChart";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenAdminDashboardPage() {
  const admin = getSupabaseAdmin();

  const [{ data: leads }, { data: appointments }, { data: clients }, { data: users }] = await Promise.all([
    admin.from("leadgen_leads").select("id, status, client_id, campaign_id, assigned_agent_id, next_follow_up_at, created_at"),
    admin.from("leadgen_appointments").select("status, client_id"),
    admin.from("leadgen_clients").select("id, name"),
    admin
      .from("leadgen_users")
      .select("id, full_name, role")
      .eq("role", "agent")
      .eq("active", true)
      .neq("email", DEACTIVATED_TEST_AGENT_EMAIL),
  ]);

  const allLeads = leads ?? [];
  const allAppointments = appointments ?? [];
  const allClients = clients ?? [];
  const agents = users ?? [];

  const totalLeads = allLeads.length;
  const interestedLeads = allLeads.filter((l) => l.status === "Interested").length;
  const appointmentsBooked = allAppointments.length;
  // Same source of truth as the Leads page's Due Today/Overdue filters
  // (LeadsListClient.tsx) - each lead's own next_follow_up_at, not a raw
  // scan of leadgen_followups rows, so these counts can never drift out
  // of sync with what clicking through to the Leads page actually shows.
  const followUpsDueToday = allLeads.filter((l) => isLeadgenNextFollowUpDueToday(l.next_follow_up_at)).length;
  const overdueFollowUps = allLeads.filter((l) => isLeadgenNextFollowUpOverdue(l.next_follow_up_at)).length;

  const byCampaignClient = new Map<string, { name: string; leads: number; appointments: number }>();
  for (const client of allClients) byCampaignClient.set(client.id, { name: client.name, leads: 0, appointments: 0 });
  for (const lead of allLeads) {
    const entry = byCampaignClient.get(lead.client_id);
    if (entry) entry.leads++;
  }
  for (const appt of allAppointments) {
    const entry = byCampaignClient.get(appt.client_id);
    if (entry) entry.appointments++;
  }

  // Each card links straight into the Leads page pre-filtered to that
  // exact slice (see LeadsListClient's initialStatusFilter/
  // initialFollowUpFilter props), so clicking a number is never a dead
  // end - every row on the landed page already links to that lead's own
  // profile, where the admin can act immediately.
  const stats = [
    { label: "Total Leads", value: String(totalLeads), href: "/leadgen/admin/leads", tone: LEADGEN_STAT_CARD_STYLES.leads, icon: Users },
    {
      label: "Interested Leads",
      value: String(interestedLeads),
      href: "/leadgen/admin/leads?status=Interested",
      tone: LEADGEN_STAT_CARD_STYLES.interested,
      icon: UserCheck,
    },
    {
      label: "Appointments Booked",
      value: String(appointmentsBooked),
      href: `/leadgen/admin/leads?status=${encodeURIComponent("Appointment booked")}`,
      tone: LEADGEN_STAT_CARD_STYLES.appointments,
      icon: CalendarCheck,
    },
    {
      label: "Follow-ups Due Today",
      value: String(followUpsDueToday),
      href: "/leadgen/admin/leads?followup=due_today",
      tone: LEADGEN_STAT_CARD_STYLES.dueToday,
      icon: Clock,
    },
    {
      label: "Overdue Follow-ups",
      value: String(overdueFollowUps),
      href: "/leadgen/admin/leads?followup=overdue",
      tone: LEADGEN_STAT_CARD_STYLES.overdue,
      icon: AlertTriangle,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Lead Generation CRM overview across every client and campaign.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <KpiCard key={stat.label} label={stat.label} value={stat.value} href={stat.href} tone={stat.tone} icon={<stat.icon />} />
        ))}
      </div>

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
                    <Link href={`/leadgen/admin/clients/${id}`} className="font-medium text-sky-600 hover:text-sky-700">
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right">{row.leads}</td>
                  <td className="py-2 text-right">{row.appointments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-green-700">Results by Agent</h2>
        <ResultsByAgentChart agents={agents} leads={allLeads} serverNowIso={new Date().toISOString()} />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Training</h2>
        <p className="mt-2 text-[13.5px] text-slate-600">
          Open the Brent&apos;s Essentials call script for a clear, read-only guide agents can use while calling.
        </p>
        <Link href="/leadgen/admin/training" className="mt-3 inline-block text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
          Open Training
        </Link>
      </section>
    </div>
  );
}
