import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { leadgenDateKey, leadgenMondayOf, type LeadgenPerformanceAppointment } from "@/lib/leadgen-performance";
import { syncLeadgenWeeklyPerformanceHistory } from "@/lib/leadgen-performance-history-sync";
import type { LeadgenWeeklyHistoryRow } from "@/lib/leadgen-performance-history";
import AgentMonthlyPerformanceCard from "@/components/leadgen/AgentMonthlyPerformanceCard";

// Agent's own view of the Monthly Performance report - only ever this
// agent's own data, never another agent's:
//  - appointments are read through the session-scoped client, so RLS
//    (leadgen_appointments_agent_select_own) is what actually keeps this
//    to appointments this agent is allowed to see - same query the
//    existing weekly page (/leadgen/agent/performance) already uses.
//  - the one-time freeze-completed-weeks sync needs the service-role
//    admin client (agents have no insert/update grant on
//    leadgen_agent_weekly_performance, only select-own - migration 0051),
//    but is called with only this agent in its `agents` list, so it only
//    ever writes this agent's own history rows.
//  - the history read-back is explicitly filtered to this agent's id,
//    even though it's on the admin client, as defense in depth on top of
//    that scoping.
// The admin's equivalent view (/leadgen/admin/performance) shows every
// agent and lets the admin switch between them; this page deliberately
// has no such switch.
export default async function LeadgenAgentMonthlyPerformancePage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();

  const { data: appointments } = await supabase
    .from("leadgen_appointments")
    .select("id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id")
    .order("appointment_date", { ascending: false });

  const allAppointments = (appointments ?? []) as LeadgenPerformanceAppointment[];

  const now = new Date();
  await syncLeadgenWeeklyPerformanceHistory(admin, [{ id: agent.id, full_name: agent.full_name, email: agent.email }], allAppointments, now);

  const { data: historyRows } = await admin
    .from("leadgen_agent_weekly_performance")
    .select("agent_id, agent_name, week_start, week_end, booked_count, target, percentage, status")
    .eq("agent_id", agent.id);

  const todayKey = leadgenDateKey(now);
  const currentWeekStart = leadgenMondayOf(todayKey);
  const [currentYear, currentMonth] = todayKey.split("-").map(Number);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monthly Performance</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your booked-appointment performance for the selected month, against a goal of 4 appointments per Monday-Sunday week that has
            started. Previous months stay available after the month changes.
          </p>
        </div>
        <Link href="/leadgen/agent/performance" className="text-[13px] font-medium text-sky-600 hover:text-sky-700">
          ← View Weekly Performance
        </Link>
      </div>

      <div className="mt-6">
        <AgentMonthlyPerformanceCard
          agentId={agent.id}
          agentName={agent.full_name || agent.email}
          appointments={allAppointments}
          historyRows={(historyRows ?? []) as LeadgenWeeklyHistoryRow[]}
          currentWeekStart={currentWeekStart}
          currentYear={currentYear}
          currentMonth={currentMonth}
        />
      </div>
    </div>
  );
}
