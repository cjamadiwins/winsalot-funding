import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  computeLeadgenAgentPerformance,
  leadgenDateKey,
  leadgenMondayOf,
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  type LeadgenPerformanceAppointment,
} from "@/lib/leadgen-performance";
import { syncLeadgenWeeklyPerformanceHistory } from "@/lib/leadgen-performance-history-sync";
import type { LeadgenWeeklyHistoryRow } from "@/lib/leadgen-performance-history";
import type { LeadgenUserRow } from "@/lib/leadgen-types";
import {
  computeLeadgenAgentActivityKpis,
  computeLeadgenTeamActivityKpis,
  type LeadgenKpiCallLogRow,
  type LeadgenKpiEmailRow,
  type LeadgenKpiFollowUpRow,
} from "@/lib/leadgen-agent-kpi";
import AgentPerformanceCard from "@/components/leadgen/AgentPerformanceCard";
import AgentActivityKpiSection from "@/components/leadgen/AgentActivityKpiSection";
import TeamActivityKpiSection from "@/components/leadgen/TeamActivityKpiSection";
import MonthlyPerformanceSection from "@/components/leadgen/MonthlyPerformanceSection";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

// Admin view of the Agent Performance Report - every active agent, each
// with their own weekly-target card (see AgentPerformanceCard). Agents
// only ever see their own card - /leadgen/agent/performance. Below the
// unchanged weekly cards, MonthlyPerformanceSection adds the Monthly
// Performance history view, reading the permanent weekly ledger this
// page keeps in sync (see leadgen-performance-history-sync.ts).
export default async function LeadgenAdminPerformancePage() {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();

  const [{ data: agents }, { data: appointments }, { data: callLogs }, { data: emails }, { data: followUps }, { data: leads }] = await Promise.all([
    admin
      .from("leadgen_users")
      .select("id, full_name, email")
      .eq("role", "agent")
      .eq("active", true)
      .neq("email", DEACTIVATED_TEST_AGENT_EMAIL)
      .order("full_name"),
    admin
      .from("leadgen_appointments")
      .select("id, lead_id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id")
      .order("appointment_date", { ascending: false }),
    // Calls / Emails / Follow-Ups KPI source of truth - see
    // leadgen-agent-kpi.ts's header comment for why each of these reuses an
    // existing table rather than a new manual counter.
    admin.from("leadgen_call_logs").select("agent_id, created_at"),
    admin.from("leadgen_emails").select("sent_by, sent_at, delivered_at, bounced_at, failed_at").not("sent_by", "is", null),
    admin.from("leadgen_followups").select("agent_id, status, completed_at").eq("status", "completed"),
    admin.from("leadgen_leads").select("id, status, assigned_agent_id").eq("status", "Interested"),
  ]);

  const allAgents = (agents ?? []) as Pick<LeadgenUserRow, "id" | "full_name" | "email">[];
  const allAppointments = (appointments ?? []) as LeadgenPerformanceAppointment[];
  const allCallLogs = (callLogs ?? []) as LeadgenKpiCallLogRow[];
  const allEmails = (emails ?? []) as LeadgenKpiEmailRow[];
  const allCompletedFollowUps = (followUps ?? []) as LeadgenKpiFollowUpRow[];
  // Interested Leads is credited to whichever agent a lead is currently
  // assigned to (leadgen_leads.assigned_agent_id) - the same field the
  // Leads page and RLS both already use as this CRM's one notion of lead
  // ownership.
  const interestedLeads = (leads ?? []) as { id: string; status: string; assigned_agent_id: string | null }[];
  const interestedLeadsByAgent = new Map<string, number>();
  for (const lead of interestedLeads) {
    if (!lead.assigned_agent_id) continue;
    interestedLeadsByAgent.set(lead.assigned_agent_id, (interestedLeadsByAgent.get(lead.assigned_agent_id) ?? 0) + 1);
  }
  const totalInterestedLeads = interestedLeads.length;

  const activityKpisByAgent = new Map(
    allAgents.map((agentRow) => [agentRow.id, computeLeadgenAgentActivityKpis(allCallLogs, allEmails, allCompletedFollowUps, agentRow.id)])
  );
  const teamActivityKpis = computeLeadgenTeamActivityKpis(Array.from(activityKpisByAgent.values()));
  const totalAppointmentsBookedThisWeek = allAgents.reduce(
    (total, agentRow) => total + computeLeadgenAgentPerformance(allAppointments, agentRow.id).bookedThisWeek,
    0
  );

  const now = new Date();
  await syncLeadgenWeeklyPerformanceHistory(admin, allAgents, allAppointments, now);

  const { data: historyRows } = await admin
    .from("leadgen_agent_weekly_performance")
    .select("agent_id, agent_name, week_start, week_end, booked_count, target, percentage, status")
    .eq("definition_version", 2)
    .in("agent_id", allAgents.map((agent) => agent.id));

  const todayKey = leadgenDateKey(now);
  const currentWeekStart = leadgenMondayOf(todayKey);
  const [currentYear, currentMonth] = todayKey.split("-").map(Number);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent Performance Report</h1>
          <p className="mt-1 text-sm text-slate-500">
            Weekly (Monday-Friday) booked-appointment performance against a target of 4 per agent, reset every Monday.
            Cancelled and duplicate (replaced) appointments never count.
          </p>
        </div>
        <Link
          href="/leadgen/admin/performance/call-notes"
          className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
        >
          View All Call Logs
        </Link>
      </div>

      {allAgents.length > 0 && (
        <div className="mt-6">
          <TeamActivityKpiSection
            team={teamActivityKpis}
            totalInterestedLeads={totalInterestedLeads}
            totalAppointmentsBookedThisWeek={totalAppointmentsBookedThisWeek}
          />
        </div>
      )}

      <div className="mt-6 space-y-6">
        {allAgents.length === 0 ? (
          <p className="text-[13.5px] text-slate-500">No active agents yet.</p>
        ) : (
          allAgents.map((agent) => {
            const agentName = agent.full_name || agent.email;
            const agentActivityKpis = activityKpisByAgent.get(agent.id);
            const agentPerformance = computeLeadgenAgentPerformance(allAppointments, agent.id);
            return (
              <div key={agent.id} className="space-y-3">
                {agentActivityKpis && (
                  <AgentActivityKpiSection
                    agentName={agentName}
                    kpis={agentActivityKpis}
                    interestedLeads={interestedLeadsByAgent.get(agent.id) ?? 0}
                    appointmentsBookedThisWeek={agentPerformance.bookedThisWeek}
                    appointmentsWeeklyTarget={LEADGEN_WEEKLY_APPOINTMENT_TARGET}
                  />
                )}
                <AgentPerformanceCard agentName={agentName} performance={agentPerformance} leadHrefBase="/leadgen/admin/leads" />
              </div>
            );
          })
        )}
      </div>

      <MonthlyPerformanceSection
        agents={allAgents.map((agent) => ({ id: agent.id, name: agent.full_name || agent.email }))}
        appointments={allAppointments}
        historyRows={(historyRows ?? []) as LeadgenWeeklyHistoryRow[]}
        currentWeekStart={currentWeekStart}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
    </div>
  );
}
