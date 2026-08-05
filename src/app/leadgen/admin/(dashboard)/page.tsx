import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { LEADGEN_STAT_CARD_STYLES, isLeadgenFollowUpDueToday, isLeadgenFollowUpOverdue } from "@/lib/leadgen-types";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenAdminDashboardPage() {
  const admin = getSupabaseAdmin();

  const [{ data: leads }, { data: appointments }, { data: followUps }, { data: clients }, { data: users }] = await Promise.all([
    admin.from("leadgen_leads").select("id, status, client_id, campaign_id, assigned_agent_id"),
    admin.from("leadgen_appointments").select("status, client_id"),
    admin.from("leadgen_followups").select("scheduled_at, status"),
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
  const allFollowUps = followUps ?? [];
  const allClients = clients ?? [];
  const agents = users ?? [];

  const totalLeads = allLeads.length;
  const interestedLeads = allLeads.filter((l) => l.status === "Interested").length;
  const appointmentsBooked = allAppointments.length;
  const followUpsDueToday = allFollowUps.filter(isLeadgenFollowUpDueToday).length;
  const overdueFollowUps = allFollowUps.filter(isLeadgenFollowUpOverdue).length;

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

  const byAgent = new Map<string, { name: string; leads: number }>();
  for (const agent of agents) byAgent.set(agent.id, { name: agent.full_name, leads: 0 });
  for (const lead of allLeads) {
    if (!lead.assigned_agent_id) continue;
    const entry = byAgent.get(lead.assigned_agent_id);
    if (entry) entry.leads++;
  }

  // Each card links straight into the Leads page pre-filtered to that
  // exact slice (see LeadsListClient's initialStatusFilter/
  // initialFollowUpFilter props), so clicking a number is never a dead
  // end - every row on the landed page already links to that lead's own
  // profile, where the admin can act immediately.
  const stats: { label: string; value: string; href: string; colorClass: string }[] = [
    { label: "Total Leads", value: String(totalLeads), href: "/leadgen/admin/leads", colorClass: LEADGEN_STAT_CARD_STYLES.leads },
    {
      label: "Interested Leads",
      value: String(interestedLeads),
      href: "/leadgen/admin/leads?status=Interested",
      colorClass: LEADGEN_STAT_CARD_STYLES.interested,
    },
    {
      label: "Appointments Booked",
      value: String(appointmentsBooked),
      href: `/leadgen/admin/leads?status=${encodeURIComponent("Appointment booked")}`,
      colorClass: LEADGEN_STAT_CARD_STYLES.appointments,
    },
    {
      label: "Follow-ups Due Today",
      value: String(followUpsDueToday),
      href: "/leadgen/admin/leads?followup=due_today",
      colorClass: LEADGEN_STAT_CARD_STYLES.dueToday,
    },
    {
      label: "Overdue Follow-ups",
      value: String(overdueFollowUps),
      href: "/leadgen/admin/leads?followup=overdue",
      colorClass: LEADGEN_STAT_CARD_STYLES.overdue,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Lead Generation CRM overview across every client and campaign.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`rounded-xl border p-3.5 transition hover:shadow-sm ${stat.colorClass}`}
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-wide opacity-80">{stat.label}</div>
            <div className="mt-1 text-[18px] font-bold">{stat.value}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-green-700">Results by Agent</h2>
          {byAgent.size === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No agents yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                  <th className="py-2">Agent</th>
                  <th className="py-2 text-right">Assigned Leads</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byAgent.entries()).map(([id, row]) => (
                  <tr key={id} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{row.name}</td>
                    <td className="py-2 text-right">{row.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
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
