import { notFound } from "next/navigation";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_LEAD_CLIENT_FEEDBACK_STYLES,
  LEADGEN_LEAD_STATUS_STYLES,
  type LeadgenAppointmentRow,
  type LeadgenLeadClientFeedbackRow,
  type LeadgenLeadRow,
} from "@/lib/leadgen-types";
import LeadFeedbackForm from "@/components/crm-clients/LeadFeedbackForm";
import { submitLeadFeedbackAction } from "../../actions";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Client-safe lead detail (brief "LEAD DETAILS"). Shows business/contact
// info, current status, appointment info, this client's own feedback
// history, and client_notes (an explicitly admin/agent-opted-in note) -
// and nothing else. Deliberately never queries leadgen_lead_activities
// (the internal call/note timeline) or the internal `notes` column -
// neither is exposed to a client login anywhere in this app (see
// leadgen_lead_activities' RLS, which has no client policy at all).
export default async function ClientPortalLeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { client } = await requireLeadgenPortalClient();
  const { leadId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase.from("leadgen_leads").select("*").eq("id", leadId).eq("client_id", client.id).maybeSingle();
  if (!lead) notFound();

  const [{ data: appointments }, { data: feedbackHistory }, { data: clientActivity }] = await Promise.all([
    supabase.from("leadgen_appointments").select("*").eq("lead_id", leadId).eq("client_id", client.id).order("appointment_date", { ascending: false }),
    supabase
      .from("leadgen_lead_client_feedback")
      .select("*")
      .eq("lead_id", leadId)
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("leadgen_client_activities")
      .select("id, lead_id, activity_type, summary, occurred_at")
      .eq("lead_id", leadId)
      .eq("client_id", client.id)
      .order("occurred_at", { ascending: false }),
  ]);

  const leadRow = lead as LeadgenLeadRow;
  const appointmentRows = (appointments ?? []) as LeadgenAppointmentRow[];
  const feedbackRows = (feedbackHistory ?? []) as LeadgenLeadClientFeedbackRow[];
  const clientActivityRows = (clientActivity ?? []) as Array<{
    id: string;
    lead_id: string;
    activity_type: string;
    summary: string;
    occurred_at: string;
  }>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{leadRow.business_name}</h1>
      <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[leadRow.status]}`}>
        {leadRow.status}
      </span>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Business / Contact Information</h2>
          <dl className="mt-3 space-y-2 text-[13.5px]">
            {leadRow.contact_name && (
              <div>
                <dt className="text-slate-500">Contact Name</dt>
                <dd className="font-medium text-slate-900">{leadRow.contact_name}</dd>
              </div>
            )}
            {leadRow.phone && (
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-medium text-slate-900">{leadRow.phone}</dd>
              </div>
            )}
            {leadRow.email && (
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{leadRow.email}</dd>
              </div>
            )}
            {leadRow.website && (
              <div>
                <dt className="text-slate-500">Website</dt>
                <dd className="font-medium text-slate-900">{leadRow.website}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Contact &amp; Follow-Up History</h2>
          <dl className="mt-3 space-y-2 text-[13.5px]">
            <div>
              <dt className="text-slate-500">Date Added</dt>
              <dd className="font-medium text-slate-900">{formatDate(leadRow.created_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last Contacted</dt>
              <dd className="font-medium text-slate-900">{formatDate(leadRow.last_contacted_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Next Follow-Up</dt>
              <dd className="font-medium text-slate-900">{formatDate(leadRow.next_follow_up_at)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {leadRow.client_notes && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Notes From Winsalot</h2>
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] text-slate-700">{leadRow.client_notes}</p>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Progress Updates</h2>
        {clientActivityRows.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No progress updates yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {clientActivityRows.map((activity) => (
              <li key={activity.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-slate-900">{activity.summary}</span>
                  <span className="shrink-0 text-[12px] text-slate-500">{formatDateTime(activity.occurred_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Appointment Information</h2>
        {appointmentRows.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No appointment booked for this lead yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {appointmentRows.map((appt) => (
              <li key={appt.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    {appt.appointment_date} {appt.appointment_time} ({appt.timezone})
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>{appt.status}</span>
                </div>
                <p className="mt-1 text-slate-600">{appt.meeting_type}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Your Feedback</h2>
        {feedbackRows.length > 0 && (
          <ul className="mt-3 space-y-2">
            {feedbackRows.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_CLIENT_FEEDBACK_STYLES[entry.feedback]}`}>
                    {entry.feedback}
                  </span>
                  <span className="text-[12px] text-slate-500">{formatDateTime(entry.created_at)}</span>
                </div>
                {entry.note && <p className="mt-1 text-slate-600">{entry.note}</p>}
                <p className="mt-1 text-[11.5px] text-slate-400">Submitted by {entry.submitted_by_name}</p>
              </li>
            ))}
          </ul>
        )}
        <LeadFeedbackForm leadId={leadRow.id} submitAction={submitLeadFeedbackAction} />
      </section>
    </div>
  );
}
