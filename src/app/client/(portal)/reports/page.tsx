import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isLeadgenAppointmentCountable, type LeadgenAppointmentRow, type LeadgenCampaignRow, type LeadgenLeadRow } from "@/lib/leadgen-types";

type PeriodStats = {
  label: string;
  leadsWorked: number;
  interestedLeads: number;
  followUps: number;
  appointmentsBooked: number;
  appointmentsCompleted: number;
  conversionRate: number;
};

function computePeriodStats(label: string, leads: LeadgenLeadRow[], appointments: LeadgenAppointmentRow[], since: Date): PeriodStats {
  const sinceIso = since.toISOString();
  const leadsWorkedList = leads.filter((l) => l.last_contacted_at && l.last_contacted_at >= sinceIso);
  const interestedLeads = leads.filter((l) => l.status === "Interested" && l.last_contacted_at && l.last_contacted_at >= sinceIso).length;
  const followUps = leads.filter((l) => l.next_follow_up_at && l.next_follow_up_at >= sinceIso).length;
  const sinceDateKey = since.toISOString().slice(0, 10);
  const appointmentsInPeriod = appointments.filter((a) => a.appointment_date >= sinceDateKey);
  const appointmentsBooked = appointmentsInPeriod.filter((a) => isLeadgenAppointmentCountable(a.status)).length;
  const appointmentsCompleted = appointmentsInPeriod.filter((a) => a.status === "Completed").length;
  const conversionRate = leadsWorkedList.length > 0 ? Math.round((appointmentsCompleted / leadsWorkedList.length) * 100) : 0;

  return {
    label,
    leadsWorked: leadsWorkedList.length,
    interestedLeads,
    followUps,
    appointmentsBooked,
    appointmentsCompleted,
    conversionRate,
  };
}

function ReportCard({ stats }: { stats: PeriodStats }) {
  const rows: { label: string; value: string }[] = [
    { label: "Leads Worked", value: String(stats.leadsWorked) },
    { label: "Interested Leads", value: String(stats.interestedLeads) },
    { label: "Follow-Ups", value: String(stats.followUps) },
    { label: "Appointments Booked", value: String(stats.appointmentsBooked) },
    { label: "Completed Appointments", value: String(stats.appointmentsCompleted) },
    { label: "Conversion Rate", value: `${stats.conversionRate}%` },
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-[15px] font-bold text-slate-900">{stats.label}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{row.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// Simple weekly/monthly reporting (brief "REPORTING") - deliberately no
// payroll, agent activity, or other internal KPI; every number here comes
// from the same leadgen_leads/leadgen_appointments rows the Dashboard and
// My Leads pages already show this client, just aggregated over a rolling
// 7/30-day window instead of all time.
export default async function ClientPortalReportsPage() {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const [{ data: leads }, { data: appointments }, { data: campaigns }] = await Promise.all([
    supabase.from("leadgen_leads").select("*").eq("client_id", client.id),
    supabase.from("leadgen_appointments").select("*").eq("client_id", client.id),
    supabase.from("leadgen_campaigns").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
  ]);

  const allLeads = (leads ?? []) as LeadgenLeadRow[];
  const allAppointments = (appointments ?? []) as LeadgenAppointmentRow[];
  const allCampaigns = (campaigns ?? []) as LeadgenCampaignRow[];
  const primaryCampaign = allCampaigns.find((c) => c.status === "active") ?? allCampaigns[0] ?? null;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const weeklyStats = computePeriodStats("This Week", allLeads, allAppointments, weekAgo);
  const monthlyStats = computePeriodStats("This Month", allLeads, allAppointments, monthAgo);

  const completedAppointments = allAppointments.filter((a) => a.status === "Completed").length;
  const goal = primaryCampaign?.appointment_goal ?? null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
      <p className="mt-1 text-sm text-slate-500">Weekly and monthly performance for your campaign.</p>

      {primaryCampaign && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Campaign Progress</h2>
          <p className="mt-2 text-[13.5px] font-semibold text-slate-900">
            {primaryCampaign.name}
            {primaryCampaign.pilot_label ? ` — ${primaryCampaign.pilot_label}` : ""}
          </p>
          {goal ? (
            <>
              <p className="mt-1 text-[13.5px] text-slate-600">
                {completedAppointments} of {goal} qualified appointments completed
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, Math.round((completedAppointments / goal) * 100))}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-[13.5px] text-slate-600">Status: {primaryCampaign.status}</p>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ReportCard stats={weeklyStats} />
        <ReportCard stats={monthlyStats} />
      </div>
    </div>
  );
}
