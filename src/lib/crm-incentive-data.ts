import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmIncentiveAppointment } from "./crm-incentives";

// Fetches every winsalot_appointments row shaped for
// computeCrmWeeklyIncentive. Mirrors getCrmPerformanceRecords
// (crm-performance-data.ts) exactly - same agentId-scoping convention
// for the agent's own dashboard vs the admin's "every agent" view.
export async function getCrmIncentiveAppointments(agentId?: string): Promise<CrmIncentiveAppointment[]> {
  const admin = getSupabaseAdmin();

  let query = admin.from("winsalot_appointments").select("id, assigned_agent_id, created_at, status, incentive_status");
  if (agentId) query = query.eq("assigned_agent_id", agentId);

  const { data: appointments } = await query;
  if (!appointments) return [];

  return appointments.map((a) => ({
    id: a.id as string,
    assignedAgentId: (a.assigned_agent_id as string | null) ?? null,
    createdAt: a.created_at as string,
    status: a.status as CrmIncentiveAppointment["status"],
    incentiveStatus: (a.incentive_status as CrmIncentiveAppointment["incentiveStatus"]) ?? null,
  }));
}
