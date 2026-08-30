import { notFound } from "next/navigation";
import Link from "next/link";
import { Eye } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeClientDashboardSummary } from "@/lib/client-portal-dashboard";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentRow, type LeadgenLeadRow } from "@/lib/leadgen-types";

// Read-only "View as Client" admin preview (brief section "ADMIN
// PREVIEW"). Deliberately NOT session impersonation - it never signs in
// as the client or touches Row Level Security in any way. It stays on
// the admin's own Growth CRM session (requireCrmAdmin) and reads the
// linked Lead Generation client's data through the Supabase service-role
// client (the same one the Client Portal Access panel itself uses),
// reusing the exact same dashboard-summary computation the real client
// login sees (computeClientDashboardSummary) so the preview can never
// show different numbers than the client's own dashboard would.
export default async function ClientPortalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: crmClient } = await supabase.from("crm_clients").select("id, company_name, leadgen_client_id").eq("id", id).maybeSingle();
  if (!crmClient?.leadgen_client_id) notFound();

  const admin = getSupabaseAdmin();
  const [{ data: leadgenClient }, { data: leads }, { data: appointments }] = await Promise.all([
    admin.from("leadgen_clients").select("id, name, slug").eq("id", crmClient.leadgen_client_id).maybeSingle(),
    admin.from("leadgen_leads").select("*").eq("client_id", crmClient.leadgen_client_id),
    admin.from("leadgen_appointments").select("*").eq("client_id", crmClient.leadgen_client_id).order("appointment_date", { ascending: false }),
  ]);

  if (!leadgenClient) notFound();

  const summary = computeClientDashboardSummary((leads ?? []) as LeadgenLeadRow[], (appointments ?? []) as LeadgenAppointmentRow[]);

  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-900">
        <Eye className="h-4 w-4" />
        ADMIN PREVIEW — CLIENT VIEW ({leadgenClient.name})
      </div>
      <p className="mt-2 text-[12.5px] text-slate-500">
        This is a read-only preview of what {leadgenClient.name} sees when they sign in. It does not use their login or affect Row Level
        Security - it&apos;s rendered from an admin-only, read-only query against their data.
      </p>

      <h1 className="mt-6 text-2xl font-bold text-slate-900">Welcome, {leadgenClient.name}</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{stat.label === "Conversion Rate" ? `${stat.value}%` : stat.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
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

      <Link href={`/admin/crm/clients/${id}`} className="mt-6 inline-block text-[13px] font-semibold text-indigo-600">
        ← Back to {crmClient.company_name}
      </Link>
    </div>
  );
}
