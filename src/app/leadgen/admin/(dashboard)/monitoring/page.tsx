import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchCommunicationFailures,
  fetchStaleLeads,
  fetchAppointmentRisks,
  fetchCallKpiAgents,
  fetchDataQualityIssues,
  fetchCampaignActivity,
  fetchOperationsMonitoringSummary,
} from "@/lib/leadgen-monitoring-data";
import OperationsMonitoringClient from "./OperationsMonitoringClient";

// Admin-only Operations Monitoring detail page (Lead Generation CRM) -
// gated by requireLeadgenAdmin() exactly like every other /leadgen/admin/*
// page. Every read is service-role since this view intentionally covers
// every agent's/client's records - same pattern the main admin dashboard
// already uses for its own admin-wide reads.
export default async function LeadgenOperationsMonitoringPage() {
  const admin = getSupabaseAdmin();
  await requireLeadgenAdmin();

  const [summary, communications, staleLeads, appointments, agentKpi, dataQuality, campaigns, { data: agents }] = await Promise.all([
    fetchOperationsMonitoringSummary(admin),
    fetchCommunicationFailures(admin),
    fetchStaleLeads(admin),
    fetchAppointmentRisks(admin),
    fetchCallKpiAgents(admin),
    fetchDataQualityIssues(admin),
    fetchCampaignActivity(admin),
    admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").eq("active", true).order("full_name"),
  ]);

  const agentOptions = ((agents ?? []) as { id: string; full_name: string; email: string }[]).map((a) => ({ id: a.id, name: a.full_name || a.email }));

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
        campaigns={campaigns}
        agents={agentOptions}
      />
    </div>
  );
}
