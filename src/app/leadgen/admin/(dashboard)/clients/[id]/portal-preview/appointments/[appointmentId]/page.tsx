import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordPortalPreview } from "@/lib/leadgen-portal-preview";
import type { LeadgenAppointmentRow } from "@/lib/leadgen-types";
import { toClientBriefView, type AppointmentBriefRow, type AppointmentFeedbackRow } from "@/lib/leadgen-appointment-prep";
import AppointmentBriefDetail from "@/components/leadgen/appointment-prep/AppointmentBriefDetail";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Admin preview of one appointment brief exactly as the client's portal
// renders it (same AppointmentBriefDetail component, fed the same
// ClientBriefView projection, so internal notes can't appear here either).
// Read-only: never stamps "Client Viewed" and never accepts feedback.
export default async function ClientPortalPreviewAppointmentPage({ params }: { params: Promise<{ id: string; appointmentId: string }> }) {
  const adminUser = await requireLeadgenAdmin();
  const { id, appointmentId } = await params;
  if (!UUID_PATTERN.test(appointmentId)) notFound();
  const admin = getSupabaseAdmin();

  const { data: appointment } = await admin.from("leadgen_appointments").select("*").eq("id", appointmentId).eq("client_id", id).maybeSingle();
  if (!appointment) notFound();
  const appt = appointment as LeadgenAppointmentRow;

  const [{ data: briefRow }, { data: feedbackRow }, { data: lead }] = await Promise.all([
    admin.from("leadgen_appointment_briefs").select("*").eq("appointment_id", appt.id).maybeSingle(),
    admin.from("leadgen_appointment_feedback").select("*").eq("appointment_id", appt.id).maybeSingle(),
    appt.lead_id ? admin.from("leadgen_leads").select("website, industry").eq("id", appt.lead_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  await recordPortalPreview(admin, { adminId: adminUser.id, clientId: id, appointmentId: appt.id });

  const brief = (briefRow as AppointmentBriefRow | null) ?? null;
  const isDraft = brief && (brief.prep_status === "brief_not_prepared" || brief.prep_status === "brief_ready");

  return (
    <div>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[13px] text-indigo-900">
        <span className="font-semibold">Admin preview</span> - read-only, signed in as you. Viewing does not mark the brief as viewed.{" "}
        <Link href={`/leadgen/admin/clients/${id}/portal-preview`} className="font-semibold underline">
          All appointments
        </Link>
        {isDraft && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Draft - the client can&apos;t see this yet</span>}
      </div>
      <div className="mt-3 max-w-3xl">
        <AppointmentBriefDetail
          readOnly
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
        />
      </div>
    </div>
  );
}
