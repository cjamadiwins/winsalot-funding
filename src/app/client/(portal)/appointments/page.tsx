import Link from "next/link";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentRow } from "@/lib/leadgen-types";
import { isUpcomingLeadgenAppointment } from "@/lib/client-portal-dashboard";

type AppointmentFilter = "upcoming" | "completed";

const APPOINTMENT_FILTER_TABS: { key: AppointmentFilter | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

function matchesAppointmentFilter(appt: LeadgenAppointmentRow, filter: AppointmentFilter | undefined): boolean {
  if (!filter) return true;
  if (filter === "upcoming") return isUpcomingLeadgenAppointment(appt);
  return appt.status === "Completed";
}

export default async function ClientPortalAppointmentsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();
  const { filter: rawFilter } = await searchParams;
  const filter = (["upcoming", "completed"] as const).includes(rawFilter as AppointmentFilter) ? (rawFilter as AppointmentFilter) : undefined;

  const { data: appointments } = await supabase
    .from("leadgen_appointments")
    .select("*")
    .eq("client_id", client.id)
    .order("appointment_date", { ascending: false });

  const allRows = (appointments ?? []) as LeadgenAppointmentRow[];
  const rows = allRows.filter((appt) => matchesAppointmentFilter(appt, filter));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
      <p className="mt-1 text-sm text-slate-500">Every consultation booked for your campaigns.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {APPOINTMENT_FILTER_TABS.map((tab) => {
          const active = tab.key === "all" ? !filter : filter === tab.key;
          const href = tab.key === "all" ? "/client/appointments" : `/client/appointments?filter=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
                active
                  ? "border-[var(--crm-accent,#3e7ef7)] bg-[var(--crm-accent,#3e7ef7)] text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">{filter ? "No appointments match this filter." : "No appointments booked yet."}</p>
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
