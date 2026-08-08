import { requireLeadgenClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentRow } from "@/lib/leadgen-types";

export default async function LeadgenClientAppointmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { client } = await requireLeadgenClient(slug);
  const supabase = await createSupabaseServerClient();

  const { data: appointments } = await supabase
    .from("leadgen_appointments")
    .select("*")
    .eq("client_id", client.id)
    .order("appointment_date", { ascending: false });

  const rows = (appointments ?? []) as LeadgenAppointmentRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
      <p className="mt-1 text-sm text-slate-500">Every consultation booked for your campaigns.</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No appointments booked yet.</p>
        ) : (
          <table className="w-full min-w-[600px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Business</th>
                <th className="p-3">Date/Time</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((appt) => (
                <tr key={appt.id} className="border-b border-slate-100">
                  <td className="p-3 font-semibold text-slate-900">
                    {appt.business_name}
                    {appt.contact_name && <div className="text-[12px] font-normal text-slate-500">{appt.contact_name}</div>}
                  </td>
                  <td className="p-3 text-slate-600">
                    {appt.appointment_date} {appt.appointment_time} ({appt.timezone})
                  </td>
                  <td className="p-3 text-slate-600">{appt.meeting_type}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>{appt.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
