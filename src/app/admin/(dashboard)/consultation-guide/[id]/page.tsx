import { notFound } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import ConsultationGuideForm from "../ConsultationGuideForm";
import { updateConsultationGuideAction, completeConsultationGuideAction } from "../actions";
import type { CrmConsultationGuideRow } from "@/lib/consultation-guide";

// Reopen an existing consultation guide (draft or completed) - "Keep
// historical consultations available so Admin can reopen them later."
export default async function ConsultationGuideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: guide } = await supabase.from("crm_consultation_guides").select("*").eq("id", id).maybeSingle();
  if (!guide) notFound();

  return (
    <ConsultationGuideForm
      guide={guide as CrmConsultationGuideRow}
      saveAction={updateConsultationGuideAction.bind(null, id)}
      completeAction={completeConsultationGuideAction.bind(null, id)}
      backHref="/admin/consultation-guide"
    />
  );
}
