import { Phone, UserCheck, Star, CalendarCheck, CheckCircle2, UserX } from "lucide-react";
import { requireLeadgenClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentRow, type LeadgenLeadRow } from "@/lib/leadgen-types";
import KpiCard, { type KpiTone } from "@/components/crm-ui/KpiCard";

export default async function LeadgenClientDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { client } = await requireLeadgenClient(slug);
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_leads_client_select_own / leadgen_appointments_client_select_own)
  // already scopes both queries to this client's own rows - no explicit
  // client_id filter needed, but harmless to include for clarity/defense
  // in depth.
  const [{ data: leads }, { data: appointments }] = await Promise.all([
    supabase.from("leadgen_leads").select("*").eq("client_id", client.id),
    supabase.from("leadgen_appointments").select("*").eq("client_id", client.id).order("appointment_date", { ascending: false }),
  ]);

  const allLeads = (leads ?? []) as LeadgenLeadRow[];
  const allAppointments = (appointments ?? []) as LeadgenAppointmentRow[];

  const businessesContacted = allLeads.filter((l) => l.last_contacted_at).length;
  // "Owners Reached" / "Interested Businesses" reflect each lead's
  // *current* status - the underlying call-by-call activity log is
  // internal-only and never exposed to a client login (RLS grants no
  // client policy on leadgen_lead_activities at all).
  const ownersReached = allLeads.filter((l) => l.status === "Owner reached").length;
  const interestedBusinesses = allLeads.filter((l) => l.status === "Interested").length;
  const appointmentsBooked = allAppointments.length;
  const appointmentsCompleted = allAppointments.filter((a) => a.status === "Completed").length;
  const noShows = allAppointments.filter((a) => a.status === "No-show").length;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allAppointments
    .filter((a) => a.appointment_date >= today && a.status !== "Cancelled" && a.status !== "Completed")
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));

  const stats: { label: string; value: string; tone: KpiTone; icon: typeof Phone }[] = [
    { label: "Total Businesses Contacted", value: String(businessesContacted), tone: "blue", icon: Phone },
    { label: "Owners Reached", value: String(ownersReached), tone: "indigo", icon: UserCheck },
    { label: "Interested Businesses", value: String(interestedBusinesses), tone: "green", icon: Star },
    { label: "Appointments Booked", value: String(appointmentsBooked), tone: "green", icon: CalendarCheck },
    { label: "Completed Appointments", value: String(appointmentsCompleted), tone: "teal", icon: CheckCircle2 },
    { label: "No-shows", value: String(noShows), tone: "red", icon: UserX },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {client.name}</h1>
      <p className="mt-1 text-sm text-slate-500">Your campaign performance at a glance.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <KpiCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} icon={<stat.icon />} />
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Upcoming Appointments</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No upcoming appointments.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((appt) => (
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
    </div>
  );
}
