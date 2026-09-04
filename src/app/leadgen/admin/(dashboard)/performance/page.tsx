import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeLeadgenAgentPerformance, leadgenDateKey, leadgenMondayOf, type LeadgenPerformanceAppointment } from "@/lib/leadgen-performance";
import { syncLeadgenWeeklyPerformanceHistory } from "@/lib/leadgen-performance-history-sync";
import type { LeadgenWeeklyHistoryRow } from "@/lib/leadgen-performance-history";
import type { LeadgenUserRow } from "@/lib/leadgen-types";
import AgentPerformanceCard from "@/components/leadgen/AgentPerformanceCard";
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

  const [{ data: agents }, { data: appointments }] = await Promise.all([
    admin
      .from("leadgen_users")
      .select("id, full_name, email")
      .eq("role", "agent")
      .eq("active", true)
      .neq("email", DEACTIVATED_TEST_AGENT_EMAIL)
      .order("full_name"),
    admin
      .from("leadgen_appointments")
      .select("id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id")
      .order("appointment_date", { ascending: false }),
  ]);

  const allAgents = (agents ?? []) as Pick<LeadgenUserRow, "id" | "full_name" | "email">[];
  const allAppointments = (appointments ?? []) as LeadgenPerformanceAppointment[];

  const now = new Date();
  await syncLeadgenWeeklyPerformanceHistory(admin, allAgents, allAppointments, now);

  const { data: historyRows } = await admin
    .from("leadgen_agent_weekly_performance")
    .select("agent_id, agent_name, week_start, week_end, booked_count, target, percentage, status")
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
            Weekly booked-appointment performance against a target of 4 per agent, reset every Monday. Cancelled appointments never count.
          </p>
        </div>
        <Link
          href="/leadgen/admin/performance/call-notes"
          className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
        >
          View All Call Notes
        </Link>
      </div>

      <div className="mt-6 space-y-6">
        {allAgents.length === 0 ? (
          <p className="text-[13.5px] text-slate-500">No active agents yet.</p>
        ) : (
          allAgents.map((agent) => (
            <AgentPerformanceCard
              key={agent.id}
              agentName={agent.full_name || agent.email}
              performance={computeLeadgenAgentPerformance(allAppointments, agent.id)}
            />
          ))
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
