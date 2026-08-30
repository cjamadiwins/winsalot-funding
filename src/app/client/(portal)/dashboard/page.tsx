import { Phone, UserCheck, Star, CalendarCheck, CheckCircle2, TrendingUp } from "lucide-react";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentRow, type LeadgenLeadRow, type LeadgenCampaignRow } from "@/lib/leadgen-types";
import { computeClientDashboardSummary, ownersReachedCount } from "@/lib/client-portal-dashboard";
import KpiCard, { type KpiTone } from "@/components/crm-ui/KpiCard";

export default async function ClientPortalDashboardPage() {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_leads_client_select_own / leadgen_appointments_client_select_own
  // / leadgen_campaigns_client_select_own) already scopes every one of
  // these queries to this client's own rows - the explicit client_id
  // filters below are defense in depth, not the actual security boundary.
  const [{ data: leads }, { data: appointments }, { data: campaigns }] = await Promise.all([
    supabase.from("leadgen_leads").select("*").eq("client_id", client.id),
    supabase.from("leadgen_appointments").select("*").eq("client_id", client.id).order("appointment_date", { ascending: false }),
    supabase.from("leadgen_campaigns").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
  ]);

  const allLeads = (leads ?? []) as LeadgenLeadRow[];
  const allAppointments = (appointments ?? []) as LeadgenAppointmentRow[];
  const allCampaigns = (campaigns ?? []) as LeadgenCampaignRow[];
  const primaryCampaign = allCampaigns.find((c) => c.status === "active") ?? allCampaigns[0] ?? null;

  const summary = computeClientDashboardSummary(allLeads, allAppointments);
  const valueByLabel = new Map(summary.stats.map((s) => [s.label, s.value]));

  const kpis: { label: string; value: string; tone: KpiTone; icon: typeof Phone }[] = [
    { label: "Total Leads", value: String(valueByLabel.get("Total Leads") ?? 0), tone: "blue", icon: Phone },
    { label: "Leads Contacted", value: String(valueByLabel.get("Leads Contacted") ?? 0), tone: "indigo", icon: UserCheck },
    { label: "Interested Leads", value: String(valueByLabel.get("Interested Leads") ?? 0), tone: "green", icon: Star },
    { label: "Follow-Ups", value: String(valueByLabel.get("Follow-Ups") ?? 0), tone: "amber", icon: TrendingUp },
    { label: "Appointments Booked", value: String(valueByLabel.get("Appointments Booked") ?? 0), tone: "green", icon: CalendarCheck },
    { label: "Completed Appointments", value: String(valueByLabel.get("Completed Appointments") ?? 0), tone: "teal", icon: CheckCircle2 },
    { label: "Conversion Rate", value: `${valueByLabel.get("Conversion Rate") ?? 0}%`, tone: "indigo", icon: TrendingUp },
  ];

  const recentActivity = allLeads
    .filter((l) => l.last_contacted_at)
    .sort((a, b) => (b.last_contacted_at ?? "").localeCompare(a.last_contacted_at ?? ""))
    .slice(0, 5);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {client.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {primaryCampaign ? `${primaryCampaign.name} · ${primaryCampaign.status}` : "Your campaign performance at a glance."}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((stat) => (
          <KpiCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} icon={<stat.icon />} />
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Upcoming Appointments</h2>
          {summary.upcomingAppointments.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No upcoming appointments.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {summary.upcomingAppointments.map((appt) => (
                <li key={appt.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{appt.business_name}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>{appt.status}</span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    {appt.appointment_date} {appt.appointment_time} ({appt.timezone}) · {appt.meeting_type}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-slate-500">No recent activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentActivity.map((lead) => (
                <li key={lead.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{lead.business_name}</span>
                    <span className="text-[12px] text-slate-500">{lead.status}</span>
                  </div>
                  <p className="mt-1 text-slate-600">Last contacted {new Date(lead.last_contacted_at as string).toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-4 text-[11.5px] text-slate-400">Owners reached: {ownersReachedCount(allLeads)}</p>
    </div>
  );
}
