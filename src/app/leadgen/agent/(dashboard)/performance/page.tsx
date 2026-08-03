import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { computeLeadgenAgentPerformance, type LeadgenPerformanceAppointment } from "@/lib/leadgen-performance";
import AgentPerformanceCard from "@/components/leadgen/AgentPerformanceCard";

// Agent's own view of the Agent Performance Report - just their own
// card. Reads through the session-scoped client, so RLS
// (leadgen_appointments_agent_select_own) is what actually keeps this to
// appointments this agent is allowed to see; the admin's equivalent page
// (/leadgen/admin/performance) shows every agent.
export default async function LeadgenAgentPerformancePage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: appointments } = await supabase
    .from("leadgen_appointments")
    .select("id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id")
    .order("appointment_date", { ascending: false });

  const performance = computeLeadgenAgentPerformance((appointments ?? []) as LeadgenPerformanceAppointment[], agent.id);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Performance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your weekly booked-appointment performance against a target of 4, reset every Monday. Cancelled appointments never count.
      </p>

      <div className="mt-6">
        <AgentPerformanceCard agentName={agent.full_name || agent.email} performance={performance} />
      </div>
    </div>
  );
}
