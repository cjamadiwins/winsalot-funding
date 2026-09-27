import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchCommunicationFailures,
  fetchStaleOpportunities,
  fetchAppointmentRisks,
  fetchCallKpiAgents,
  fetchDataQualityIssues,
  fetchClientCampaignActivity,
  fetchOperationsMonitoringSummary,
} from "@/lib/crm-monitoring-data";
import type { CrmUserRow } from "@/lib/crm-types";
import OperationsMonitoringClient from "./OperationsMonitoringClient";

// Admin-only Operations Monitoring detail page - gated by requireCrmAdmin()
// exactly like every other /admin/crm/* page, so an agent hitting this URL
// directly is redirected the same way as any other admin-only route (see
// crm-auth.ts). Every read here is service-role (getSupabaseAdmin()) since
// this view intentionally covers every agent's records, same pattern the
// main CRM dashboard already uses for its own admin-wide reads.
export default async function OperationsMonitoringPage() {
  const admin = getSupabaseAdmin();
  await requireCrmAdmin();

  const [summary, communications, staleLeads, appointments, agentKpi, dataQuality, clientCampaigns, { data: agents }] = await Promise.all([
    fetchOperationsMonitoringSummary(admin),
    fetchCommunicationFailures(admin),
    fetchStaleOpportunities(admin),
    fetchAppointmentRisks(admin),
    fetchCallKpiAgents(admin),
    fetchDataQualityIssues(admin),
    fetchClientCampaignActivity(admin),
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true).order("full_name"),
  ]);

  const agentOptions = ((agents ?? []) as Pick<CrmUserRow, "id" | "full_name" | "email">[]).map((a) => ({ id: a.id, name: a.full_name || a.email }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Operations Monitoring</h1>
      <p className="mt-1 text-sm text-slate-500">
        A single place to spot email/SMS failures, stale leads, appointment risk, agent call pace, data quality issues, and stalled client
        campaigns before they affect agents, prospects, or clients.
      </p>

      <OperationsMonitoringClient
        summary={summary}
        communications={communications}
        staleLeads={staleLeads}
        appointments={appointments}
        agentKpi={agentKpi}
        dataQuality={dataQuality}
        clientCampaigns={clientCampaigns}
        agents={agentOptions}
      />
    </div>
  );
}
