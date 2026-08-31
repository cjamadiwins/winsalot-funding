import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchClientDetail, fetchClientRelatedCounts } from "@/lib/crm-clients-data";
import { fetchPortalActivity, fetchPortalUsersForLeadgenClient, fetchUnlinkedLeadgenClients } from "@/lib/client-portal-data";
import type { CrmUserRow } from "@/lib/crm-types";
import ClientProfileClient from "@/components/crm-clients/ClientProfileClient";
import ClientPortalAccessPanel from "@/components/crm-clients/ClientPortalAccessPanel";
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
import {
  linkLeadgenClientAction,
  createAndLinkLeadgenClientAction,
  createPortalAccessAction,
  activatePortalAccessAction,
  disablePortalAccessAction,
  reactivatePortalAccessAction,
  sendPortalInviteAction,
  resetClientAccessAction,
} from "./portal-actions";

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: detail, error }, { data: agents }] = await Promise.all([
    fetchClientDetail(supabase, id),
    supabase.from("crm_users").select("*").eq("role", "agent").order("full_name"),
  ]);

  if (error || !detail) notFound();

  const [relatedCounts, unlinkedLeadgenClients, portalActivity] = await Promise.all([
    fetchClientRelatedCounts(supabase, id),
    fetchUnlinkedLeadgenClients(detail.client.leadgen_client_id ?? null),
    fetchPortalActivity(supabase, id),
  ]);

  const linkedLeadgenClient = unlinkedLeadgenClients.find((c) => c.id === detail.client.leadgen_client_id) ?? null;
  const portalUsers = detail.client.leadgen_client_id ? await fetchPortalUsersForLeadgenClient(detail.client.leadgen_client_id) : [];

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

      <ClientPortalAccessPanel
        crmClientId={id}
        leadgenClientId={detail.client.leadgen_client_id ?? null}
        leadgenClientName={linkedLeadgenClient?.name ?? null}
        leadgenClientSlug={linkedLeadgenClient?.slug ?? null}
        unlinkedLeadgenClients={unlinkedLeadgenClients}
        portalUsers={portalUsers}
        activity={portalActivity}
        linkAction={linkLeadgenClientAction}
        createAndLinkAction={createAndLinkLeadgenClientAction}
        createAccessAction={createPortalAccessAction}
        activateAction={activatePortalAccessAction}
        disableAction={disablePortalAccessAction}
        reactivateAction={reactivatePortalAccessAction}
        sendInviteAction={sendPortalInviteAction}
        resetAccessAction={resetClientAccessAction}
      />
    </div>
  );
}
