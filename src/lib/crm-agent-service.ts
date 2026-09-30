import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { isAgentService, type AgentService } from "./crm-agent-service-shared";

// The agent's current Admin-assigned Growth service, or null when Admin hasn't
// assigned one (which grants no Growth service). Read with the service-role
// client for the few server paths that bypass RLS; everything that goes
// through the session client is already scoped by RLS.
export async function getAgentServiceAssignment(agentId: string): Promise<AgentService | null> {
  const { data } = await getSupabaseAdmin().from("crm_agent_service_assignments").select("service").eq("agent_id", agentId).maybeSingle();
  return isAgentService(data?.service) ? data.service : null;
}
