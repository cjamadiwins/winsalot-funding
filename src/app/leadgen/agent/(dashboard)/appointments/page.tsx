import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL,
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE,
  LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES,
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  type LeadgenAppointmentRow,
} from "@/lib/leadgen-types";

export default async function LeadgenAgentAppointmentsPage() {
  await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { data: appointments } = await supabase
    .from("leadgen_appointments")
    .select("*")
    .order("appointment_date", { ascending: false });

  const rows = (appointments ?? []) as LeadgenAppointmentRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Appointments</h1>
      <p className="mt-1 text-sm text-slate-500">
        Consultations you&apos;re the specialist for, or booked for a lead assigned to you. Book a new one from the
        lead&apos;s profile.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No appointments yet.</p>
        ) : (
          <table className="w-full min-w-[600px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Business</th>
                <th className="p-3">Date/Time</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Incentive</th>
                <th className="p-3">Lead</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((appt) => (
                <tr key={appt.id} className="border-b border-slate-100">
                  <td className="p-3 font-semibold text-slate-900">{appt.business_name}</td>
                  <td className="p-3 text-slate-600">
                    {appt.appointment_date} {appt.appointment_time} ({appt.timezone})
                  </td>
                  <td className="p-3 text-slate-600">{appt.meeting_type}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>{appt.status}</span>
                  </td>
                  <td className="p-3">
                    <span
                      title={appt.incentive_status_reason ?? undefined}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        appt.incentive_status ? LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES[appt.incentive_status] : LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE
                      }`}
                    >
                      {appt.incentive_status ?? LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL}
                    </span>
                  </td>
                  <td className="p-3">
                    {appt.lead_id && (
                      <Link href={`/leadgen/agent/leads/${appt.lead_id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                        View Lead
                      </Link>
                    )}
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
