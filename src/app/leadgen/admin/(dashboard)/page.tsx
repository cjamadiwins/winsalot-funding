import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isLeadgenFollowUpDueToday, isLeadgenFollowUpOverdue } from "@/lib/leadgen-types";

export default async function LeadgenAdminDashboardPage() {
  const admin = getSupabaseAdmin();

  const [{ data: leads }, { data: activities }, { data: appointments }, { data: followUps }, { data: clients }, { data: users }] =
    await Promise.all([
      admin.from("leadgen_leads").select("id, status, client_id, campaign_id, assigned_agent_id"),
      admin.from("leadgen_lead_activities").select("activity_type, call_outcome"),
      admin.from("leadgen_appointments").select("status, client_id"),
      admin.from("leadgen_followups").select("scheduled_at, status"),
      admin.from("leadgen_clients").select("id, name"),
      admin.from("leadgen_users").select("id, full_name, role").eq("role", "agent"),
    ]);

  const allLeads = leads ?? [];
  const allActivities = activities ?? [];
  const allAppointments = appointments ?? [];
  const allFollowUps = followUps ?? [];
  const allClients = clients ?? [];
  const agents = users ?? [];

  const totalLeads = allLeads.length;
  const callsCompleted = allActivities.filter((a) => a.activity_type === "call").length;
  const ownersReached = allActivities.filter((a) => a.call_outcome === "Owner reached").length;
  const interestedLeads = allLeads.filter((l) => l.status === "Interested").length;
  const appointmentsBooked = allAppointments.length;
  const appointmentsCompleted = allAppointments.filter((a) => a.status === "Completed").length;
  const noShows = allAppointments.filter((a) => a.status === "No-show").length;
  const conversionRate = totalLeads > 0 ? Math.round((appointmentsBooked / totalLeads) * 100) : 0;
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

  const stats: { label: string; value: string }[] = [
    { label: "Total Leads", value: String(totalLeads) },
    { label: "Calls Completed", value: String(callsCompleted) },
    { label: "Owners Reached", value: String(ownersReached) },
    { label: "Interested Leads", value: String(interestedLeads) },
    { label: "Appointments Booked", value: String(appointmentsBooked) },
    { label: "Appointments Completed", value: String(appointmentsCompleted) },
    { label: "No-shows", value: String(noShows) },
    { label: "Conversion Rate", value: `${conversionRate}%` },
    { label: "Follow-ups Due Today", value: String(followUpsDueToday) },
    { label: "Overdue Follow-ups", value: String(overdueFollowUps) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Lead Generation CRM overview across every client and campaign.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{stat.label}</div>
            <div className="mt-1 text-[18px] font-bold text-slate-900">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Results by Client</h2>
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
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Results by Agent</h2>
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
