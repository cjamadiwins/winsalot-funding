import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchClientDetail, fetchClientRelatedCounts } from "@/lib/crm-clients-data";
import type { CrmUserRow } from "@/lib/crm-types";
import ClientProfileClient from "@/components/crm-clients/ClientProfileClient";
import {
  updateClientAction,
  archiveClientAction,
  reactivateClientAction,
  deleteClientAction,
  assignAgentAction,
  unassignAgentAction,
  recordClientAppointmentAction,
  deleteClientAppointmentAction,
  recordStandaloneClientPaymentAction,
} from "../actions";

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: detail, error }, { data: agents }] = await Promise.all([
    fetchClientDetail(supabase, id),
    supabase.from("crm_users").select("*").eq("role", "agent").order("full_name"),
  ]);

  if (error || !detail) notFound();

  const relatedCounts = await fetchClientRelatedCounts(supabase, id);

  return (
    <div>
      <ClientProfileClient
        detail={detail}
        relatedCounts={relatedCounts}
        agents={((agents ?? []) as CrmUserRow[]).map((a) => ({ id: a.id, full_name: a.full_name, email: a.email }))}
        updateAction={updateClientAction}
        archiveAction={archiveClientAction}
        reactivateAction={reactivateClientAction}
        deleteAction={deleteClientAction}
        assignAgentAction={assignAgentAction}
        unassignAgentAction={unassignAgentAction}
        recordAppointmentAction={recordClientAppointmentAction}
        deleteAppointmentAction={deleteClientAppointmentAction}
        recordPaymentAction={recordStandaloneClientPaymentAction}
      />
    </div>
  );
}
