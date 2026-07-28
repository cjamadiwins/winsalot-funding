import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenClientRow, LeadgenUserRow } from "@/lib/leadgen-types";
import AgentsClient from "./AgentsClient";

export default async function LeadgenAgentsPage() {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();

  const [{ data: users }, { data: clients }, { data: leads }, { data: activities }, { data: appointments }] = await Promise.all([
    admin.from("leadgen_users").select("*").order("full_name"),
    admin.from("leadgen_clients").select("*").order("name"),
    admin.from("leadgen_leads").select("assigned_agent_id, status"),
    admin.from("leadgen_lead_activities").select("agent_id, activity_type"),
    admin.from("leadgen_appointments").select("assigned_specialist_id, status"),
  ]);

  const performanceByAgent = new Map<string, { leads: number; calls: number; appointments: number; completed: number }>();
  for (const lead of leads ?? []) {
    if (!lead.assigned_agent_id) continue;
    const entry = performanceByAgent.get(lead.assigned_agent_id) ?? { leads: 0, calls: 0, appointments: 0, completed: 0 };
    entry.leads++;
    performanceByAgent.set(lead.assigned_agent_id, entry);
  }
  for (const activity of activities ?? []) {
    if (!activity.agent_id || activity.activity_type !== "call") continue;
    const entry = performanceByAgent.get(activity.agent_id) ?? { leads: 0, calls: 0, appointments: 0, completed: 0 };
    entry.calls++;
    performanceByAgent.set(activity.agent_id, entry);
  }
  for (const appt of appointments ?? []) {
    if (!appt.assigned_specialist_id) continue;
    const entry = performanceByAgent.get(appt.assigned_specialist_id) ?? { leads: 0, calls: 0, appointments: 0, completed: 0 };
    entry.appointments++;
    if (appt.status === "Completed") entry.completed++;
    performanceByAgent.set(appt.assigned_specialist_id, entry);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Agents &amp; Users</h1>
      <p className="mt-1 text-sm text-slate-500">Invite admins, agents, and client logins, and review agent performance.</p>

      <AgentsClient
        users={(users ?? []) as LeadgenUserRow[]}
        clients={(clients ?? []) as LeadgenClientRow[]}
        performanceByAgent={Object.fromEntries(performanceByAgent)}
      />
    </div>
  );
}
