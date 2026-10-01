import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenAppointmentRow } from "@/lib/leadgen-types";
import { toClientBriefView, type AppointmentBriefRow, type AppointmentFeedbackRow } from "@/lib/leadgen-appointment-prep";
import AppointmentBriefDetail from "@/components/leadgen/appointment-prep/AppointmentBriefDetail";
import { markBriefViewed } from "@/lib/leadgen-appointment-prep-data";
import { submitAppointmentFeedbackAction } from "../actions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Client Portal appointment detail: the Appointment Brief + post-appointment
// feedback. Every read goes through the signed-in client's own RLS session
// AND is scoped to the session's client_id, so another client's appointment
// id simply 404s. The brief policy additionally hides any brief that has not
// been sent to the client yet.
export default async function ClientPortalAppointmentDetailPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  if (!UUID_PATTERN.test(appointmentId)) notFound();

  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const { data: appointment } = await supabase.from("leadgen_appointments").select("*").eq("id", appointmentId).eq("client_id", client.id).maybeSingle();
  if (!appointment) notFound();
  const appt = appointment as LeadgenAppointmentRow;

  const [{ data: briefRow }, { data: feedbackRow }, { data: lead }] = await Promise.all([
    supabase.from("leadgen_appointment_briefs").select("*").eq("appointment_id", appt.id).eq("client_id", client.id).maybeSingle(),
    supabase.from("leadgen_appointment_feedback").select("*").eq("appointment_id", appt.id).eq("client_id", client.id).maybeSingle(),
    appt.lead_id ? supabase.from("leadgen_leads").select("website, industry").eq("id", appt.lead_id).eq("client_id", client.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  let brief = (briefRow as AppointmentBriefRow | null) ?? null;

  // Viewed tracking: the first time the authenticated client opens a SENT
  // brief, move Sent -> Viewed and stamp the time. Written with service_role
  // (clients have SELECT only) strictly after the ownership checks above.
  if (brief && brief.prep_status === "sent_to_client") {
    const viewedAt = await markBriefViewed(getSupabaseAdmin(), { appointmentId: appt.id, clientId: client.id });
    if (viewedAt) brief = { ...brief, prep_status: "client_viewed", viewed_at: viewedAt };
  }

  return (
    <div>
      <Link href="/client/appointments" className="text-[12.5px] font-semibold text-[var(--crm-accent,#3e7ef7)] hover:underline">
        ← All appointments
      </Link>
      <div className="mt-3 max-w-3xl">
        <AppointmentBriefDetail
          appointment={appt}
          brief={brief ? toClientBriefView(brief) : null}
          feedback={(feedbackRow as AppointmentFeedbackRow | null) ?? null}
          overview={{
            contactName: appt.contact_name,
            phone: appt.phone,
            email: appt.email,
            website: (lead as { website: string | null } | null)?.website ?? null,
            industry: (lead as { industry: string | null } | null)?.industry ?? null,
          }}
          submitFeedback={submitAppointmentFeedbackAction.bind(null, appt.id)}
        />
      </div>
    </div>
  );
}
