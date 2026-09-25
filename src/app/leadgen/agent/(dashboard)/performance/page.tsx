import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { computeLeadgenAgentPerformance, LEADGEN_WEEKLY_APPOINTMENT_TARGET, type LeadgenPerformanceAppointment } from "@/lib/leadgen-performance";
import { computeLeadgenAgentActivityKpis, type LeadgenKpiCallLogRow, type LeadgenKpiEmailRow, type LeadgenKpiFollowUpRow } from "@/lib/leadgen-agent-kpi";
import AgentPerformanceCard from "@/components/leadgen/AgentPerformanceCard";
import AgentActivityKpiSection from "@/components/leadgen/AgentActivityKpiSection";

// Agent's own view of the Agent Performance Report - just their own
// card. Reads through the session-scoped client, so RLS
// (leadgen_appointments_agent_select_own) is what actually keeps this to
// appointments this agent is allowed to see; the admin's equivalent page
// (/leadgen/admin/performance) shows every agent.
export default async function LeadgenAgentPerformancePage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const [{ data: appointments }, { data: callLogs }, { data: emails }, { data: followUps }, { data: leads }] = await Promise.all([
    supabase
      .from("leadgen_appointments")
      .select("id, lead_id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id")
      .order("appointment_date", { ascending: false }),
    // Calls KPI source of truth - one row per logged call (Call Log
    // feature, unchanged). RLS (leadgen_call_logs_agent_select_own)
    // already scopes this to the signed-in agent's own rows.
    supabase.from("leadgen_call_logs").select("agent_id, created_at").eq("agent_id", agent.id),
    // Emails Sent / Delivery Rate KPI source of truth - the existing
    // Resend-backed email log, filtered to emails this agent actually sent.
    supabase.from("leadgen_emails").select("sent_by, sent_at, delivered_at, bounced_at, failed_at").eq("sent_by", agent.id),
    // Follow-Ups Completed KPI source of truth - the existing Follow-Up feature.
    supabase.from("leadgen_followups").select("agent_id, status, completed_at").eq("agent_id", agent.id).eq("status", "completed"),
    supabase.from("leadgen_leads").select("id, status"),
  ]);

  const performance = computeLeadgenAgentPerformance((appointments ?? []) as LeadgenPerformanceAppointment[], agent.id);
  const activityKpis = computeLeadgenAgentActivityKpis(
    (callLogs ?? []) as LeadgenKpiCallLogRow[],
    (emails ?? []) as LeadgenKpiEmailRow[],
    (followUps ?? []) as LeadgenKpiFollowUpRow[],
    agent.id
  );
  const interestedLeads = (leads ?? []).filter((lead) => lead.status === "Interested").length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Performance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your weekly (Monday-Friday) booked-appointment performance against a target of 4, reset every Monday. Cancelled
        and duplicate (replaced) appointments never count.
      </p>

      <div className="mt-6">
        <AgentActivityKpiSection
          kpis={activityKpis}
          interestedLeads={interestedLeads}
          appointmentsBookedThisWeek={performance.bookedThisWeek}
          appointmentsWeeklyTarget={LEADGEN_WEEKLY_APPOINTMENT_TARGET}
        />
      </div>

      <div className="mt-6">
        <AgentPerformanceCard agentName={agent.full_name || agent.email} performance={performance} leadHrefBase="/leadgen/agent/leads" />
      </div>
    </div>
  );
}
