import { notFound } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import ConsultationGuideForm from "../ConsultationGuideForm";
import {
  updateConsultationGuideAction,
  completeConsultationGuideAction,
  retryConsultationFollowUpEmailAction,
  resendConsultationFollowUpEmailAction,
  deleteConsultationGuideAction,
} from "../actions";
import type { CrmConsultationGuideRow } from "@/lib/consultation-guide";

// Reopen an existing consultation guide (draft or completed) - "Keep
// historical consultations available so Admin can reopen them later."
export default async function ConsultationGuideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: guide } = await supabase.from("crm_consultation_guides").select("*").eq("id", id).maybeSingle();
  if (!guide) notFound();
  const guideRow = guide as CrmConsultationGuideRow;

  let linkedAppointmentLabel: string | null = null;
  if (guideRow.appointment_id) {
    const { data: appointment } = await supabase
      .from("winsalot_appointments")
      .select("business_name, appointment_start_at")
      .eq("id", guideRow.appointment_id)
      .maybeSingle();
    if (appointment) {
      linkedAppointmentLabel = `${appointment.business_name} — ${new Date(appointment.appointment_start_at).toLocaleString()}`;
    }
  }

  // "Show who last updated the consultation and when" - the row itself
  // only has updated_by's id, so resolve the display name here the same
  // way new/page.tsx resolves a linked appointment's assigned agent.
  let updatedByName: string | null = null;
  if (guideRow.updated_by) {
    const { data: updater } = await supabase.from("crm_users").select("full_name, email").eq("id", guideRow.updated_by).maybeSingle();
    if (updater) updatedByName = updater.full_name || updater.email;
  }

  return (
    <ConsultationGuideForm
      guide={guideRow}
      appointmentId={guideRow.appointment_id}
      linkedAppointmentLabel={linkedAppointmentLabel}
      updatedByName={updatedByName}
      saveAction={updateConsultationGuideAction.bind(null, id)}
      completeAction={completeConsultationGuideAction.bind(null, id)}
      retryFollowUpAction={retryConsultationFollowUpEmailAction}
      resendFollowUpAction={resendConsultationFollowUpEmailAction}
      deleteAction={deleteConsultationGuideAction}
      backHref="/admin/consultation-guide"
    />
  );
}
