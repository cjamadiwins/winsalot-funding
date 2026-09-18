import { notFound } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import ConsultationGuideForm from "../ConsultationGuideForm";
import { updateConsultationGuideAction, completeConsultationGuideAction, retryConsultationFollowUpEmailAction } from "../actions";
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

  return (
    <ConsultationGuideForm
      guide={guideRow}
      appointmentId={guideRow.appointment_id}
      linkedAppointmentLabel={linkedAppointmentLabel}
      saveAction={updateConsultationGuideAction.bind(null, id)}
      completeAction={completeConsultationGuideAction.bind(null, id)}
      retryFollowUpAction={retryConsultationFollowUpEmailAction}
      backHref="/admin/consultation-guide"
    />
  );
}
