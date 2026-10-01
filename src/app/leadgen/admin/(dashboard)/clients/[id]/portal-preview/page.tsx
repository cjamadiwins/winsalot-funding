import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordPortalPreview } from "@/lib/leadgen-portal-preview";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentRow } from "@/lib/leadgen-types";
import { deriveFeedbackStatus, isPreparableAppointment, type PrepStatus } from "@/lib/leadgen-appointment-prep";
import { fetchFeedbackRows, fetchPrepStatusMap } from "@/lib/leadgen-appointment-prep-data";
import { FeedbackStatusBadge, PrepStatusBadge } from "@/components/leadgen/appointment-prep/PrepStatusBadge";

// Admin-only, read-only preview of what a client's portal shows. Runs under
// the Admin's own session (requireLeadgenAdmin + service-role reads scoped to
// this client id) - no client credentials are used, and the open is audited.
export default async function ClientPortalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requireLeadgenAdmin();
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: client } = await admin.from("leadgen_clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) notFound();

  const [{ data: appointments }, prepStatuses, feedbackRows] = await Promise.all([
    admin.from("leadgen_appointments").select("*").eq("client_id", id).order("appointment_date", { ascending: false }),
    fetchPrepStatusMap(admin, id),
    fetchFeedbackRows(admin, id),
  ]);
  await recordPortalPreview(admin, { adminId: adminUser.id, clientId: id });

  const rows = (appointments ?? []) as LeadgenAppointmentRow[];
  const feedbackByAppointment = new Map(feedbackRows.map((f) => [f.appointment_id, f]));

  return (
    <div>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[13px] text-indigo-900">
        <span className="font-semibold">Admin preview</span> of the {client.name} client portal - read-only, signed in as you. This view is logged.{" "}
        <Link href={`/leadgen/admin/clients/${id}`} className="font-semibold underline">
          Back to client
        </Link>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-slate-900">Appointments</h1>
      <p className="mt-1 text-sm text-slate-500">As {client.name} sees it. Draft briefs are marked - clients only see briefs that were sent.</p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No appointments booked yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Business</th>
                <th className="p-3">Date/Time</th>
                <th className="p-3">Status</th>
                <th className="p-3">Brief</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((appt) => {
                const prep: PrepStatus | undefined = prepStatuses[appt.id];
                const feedbackStatus = deriveFeedbackStatus(appt, feedbackByAppointment.get(appt.id));
                return (
                  <tr key={appt.id} className="border-b border-slate-100">
                    <td className="p-3 font-semibold text-slate-900">{appt.business_name}</td>
                    <td className="p-3 text-slate-600">
                      {appt.appointment_date} {appt.appointment_time} ({appt.timezone})
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>{appt.status}</span>
                    </td>
                    <td className="p-3">
                      {isPreparableAppointment(appt) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {prep && <PrepStatusBadge status={prep} />}
                          {feedbackStatus && <FeedbackStatusBadge status={feedbackStatus} />}
                          <Link href={`/leadgen/admin/clients/${id}/portal-preview/appointments/${appt.id}`} className="text-[12px] font-semibold text-indigo-600 hover:underline">
                            Preview
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
