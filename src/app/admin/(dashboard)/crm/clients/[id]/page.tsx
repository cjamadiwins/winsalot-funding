import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchClientDetail, fetchClientRelatedCounts } from "@/lib/crm-clients-data";
import { fetchPortalActivity, fetchPortalUsersForLeadgenClient, fetchUnlinkedLeadgenClients } from "@/lib/client-portal-data";
import type { CrmUserRow } from "@/lib/crm-types";
import ClientProfileClient from "@/components/crm-clients/ClientProfileClient";
import ClientPortalAccessPanel from "@/components/crm-clients/ClientPortalAccessPanel";
import ClientReportsPanel from "@/components/crm-clients/ClientReportsPanel";
import LeadgenClientLinkPanel from "@/components/crm-clients/LeadgenClientLinkPanel";
import CampaignPaymentSetupPanel from "@/components/crm-clients/CampaignPaymentSetupPanel";
import ClientCommunicationHistory from "@/components/crm-clients/ClientCommunicationHistory";
import { listClientCommunications } from "@/lib/crm-client-communications";
import { buildCampaignSetupDraft } from "@/lib/crm-client-communications-shared";
import { formatCurrency } from "@/lib/crm-clients-types";
import { loadLeadgenClientReport } from "@/lib/leadgen-client-report-data";
import { resolveLeadgenReportMonth } from "@/lib/leadgen-client-report";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenClientRow, LeadgenCampaignRow, LeadgenClientPaymentConfigRow, LeadgenClientPaymentMilestoneRow } from "@/lib/leadgen-types";
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
import { sendClientReportAction } from "./report-actions";
import { sendClientUpdateAction, resendClientCommunicationAction, getClientCommunicationContentAction } from "./communication-actions";
import { updateLeadgenCampaignConfigAction } from "./campaign-actions";
import {
  updateLeadgenPaymentConfigAction,
  updatePaymentProgressAction,
  markDepositReceivedAction,
  updateLeadgenPaymentMilestoneAction,
  markMilestoneReceivedAction,
  deleteLeadgenPaymentMilestoneAction,
} from "./payment-actions";

export default async function ClientProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ report_month?: string }> }) {
  await requireCrmAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
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
  // Service-role client, same reason as reportAdmin below - a Growth CRM
  // admin's auth.uid() may have no matching leadgen_users row at all
  // (they're separate identities), so leadgen_campaigns_admin_all's RLS
  // check wouldn't necessarily pass for the regular session-bound client.
  const leadgenCampaigns = detail.client.leadgen_client_id
    ? (
        await getSupabaseAdmin()
          .from("leadgen_campaigns")
          .select("*")
          .eq("client_id", detail.client.leadgen_client_id)
          .order("created_at", { ascending: false })
      ).data as LeadgenCampaignRow[] | null
    : null;

  const paymentConfig = detail.client.leadgen_client_id
    ? ((
        await getSupabaseAdmin().from("leadgen_client_payment_configs").select("*").eq("client_id", detail.client.leadgen_client_id).maybeSingle()
      ).data as LeadgenClientPaymentConfigRow | null)
    : null;
  const paymentMilestones = paymentConfig
    ? (
        (
          await getSupabaseAdmin()
            .from("leadgen_client_payment_milestones")
            .select("*")
            .eq("payment_config_id", paymentConfig.id)
            .order("milestone_order", { ascending: true })
        ).data as LeadgenClientPaymentMilestoneRow[] | null
      ) ?? []
    : [];
  const { month: reportMonth, period: reportPeriod } = resolveLeadgenReportMonth(query.report_month);
  let clientReport = null;
  if (detail.client.leadgen_client_id) {
    const reportAdmin = getSupabaseAdmin();
    const { data: reportClient } = await reportAdmin.from("leadgen_clients").select("*").eq("id", detail.client.leadgen_client_id).maybeSingle();
    if (reportClient) {
      const fullReport = await loadLeadgenClientReport(reportAdmin, reportClient as LeadgenClientRow, reportPeriod);
      clientReport = {
        period: fullReport.period,
        leadsAdded: fullReport.leadsAdded,
        interestedLeads: fullReport.interestedLeads,
        appointmentsBooked: fullReport.appointmentsBooked,
        summary: fullReport.summary,
      };
    }
  }


  // Client Communication History + the draft for the campaign setup email
  // (built only from this client's own record; Admin reviews before sending).
  const communications = await listClientCommunications(id);
  const { data: latestAgreement } = await getSupabaseAdmin()
    .from("crm_client_agreements")
    .select("contact_person, campaign_start_date, legal_business_name")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const depositPayment = detail.payments.find((p) => p.payment_type === "initial_campaign_deposit" && !p.reversed_at) ?? null;
  const activeLeadgenCampaign = (leadgenCampaigns ?? []).find((c) => c.status === "active") ?? (leadgenCampaigns ?? [])[0] ?? null;
  const setupDraft = buildCampaignSetupDraft({
    contactName: latestAgreement?.contact_person ?? detail.client.primary_contact_name ?? null,
    companyName: latestAgreement?.legal_business_name ?? detail.client.company_name,
    campaignName: activeLeadgenCampaign?.name ?? null,
    service: detail.client.service ?? null,
    campaignStartDate: latestAgreement?.campaign_start_date ?? null,
    depositReceivedLabel: depositPayment ? formatCurrency(depositPayment.amount, depositPayment.currency) : null,
  });
  const hasSetupEmail = communications.some((c) => c.source === "client_comm" && c.category === "Campaign setup" && c.status !== "failed");

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

      <ClientCommunicationHistory
        clientId={id}
        clientEmail={detail.client.email ?? null}
        entries={communications}
        setupDraft={setupDraft}
        hasSetupEmail={hasSetupEmail}
        sendUpdateAction={sendClientUpdateAction}
        resendAction={resendClientCommunicationAction}
        getContentAction={getClientCommunicationContentAction}
      />

      <LeadgenClientLinkPanel
        crmClientId={id}
        leadgenClientId={detail.client.leadgen_client_id ?? null}
        leadgenClientName={linkedLeadgenClient?.name ?? null}
        options={unlinkedLeadgenClients}
        linkAction={linkLeadgenClientAction}
        createAndLinkAction={createAndLinkLeadgenClientAction}
      />

      {detail.client.leadgen_client_id && (
        <CampaignPaymentSetupPanel
          crmClientId={id}
          leadgenClientId={detail.client.leadgen_client_id}
          campaigns={leadgenCampaigns ?? []}
          updateAction={updateLeadgenCampaignConfigAction}
          paymentConfig={paymentConfig}
          paymentMilestones={paymentMilestones}
          paymentActions={{
            updatePaymentConfigAction: updateLeadgenPaymentConfigAction,
            updatePaymentProgressAction: updatePaymentProgressAction,
            markDepositReceivedAction: markDepositReceivedAction,
            updatePaymentMilestoneAction: updateLeadgenPaymentMilestoneAction,
            markMilestoneReceivedAction: markMilestoneReceivedAction,
            deletePaymentMilestoneAction: deleteLeadgenPaymentMilestoneAction,
          }}
        />
      )}

      <ClientReportsPanel
        crmClientId={id}
        month={reportMonth}
        report={clientReport}
        canSend={portalUsers.some((user) => user.active)}
        sendAction={sendClientReportAction}
      />

      <ClientPortalAccessPanel
        crmClientId={id}
        leadgenClientId={detail.client.leadgen_client_id ?? null}
        leadgenClientName={linkedLeadgenClient?.name ?? null}
        leadgenClientSlug={linkedLeadgenClient?.slug ?? null}
        portalUsers={portalUsers}
        activity={portalActivity}
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
