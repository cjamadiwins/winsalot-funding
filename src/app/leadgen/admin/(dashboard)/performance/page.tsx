import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeLeadgenAgentPerformance, type LeadgenPerformanceAppointment } from "@/lib/leadgen-performance";
import type { LeadgenUserRow } from "@/lib/leadgen-types";
import AgentPerformanceCard from "@/components/leadgen/AgentPerformanceCard";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

// Admin view of the Agent Performance Report - every active agent, each
// with their own weekly-target card (see AgentPerformanceCard). Agents
// only ever see their own card - /leadgen/agent/performance.
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Agent Performance Report</h1>
      <p className="mt-1 text-sm text-slate-500">
        Weekly booked-appointment performance against a target of 4 per agent, reset every Monday. Cancelled appointments never count.
      </p>

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
    </div>
  );
}
