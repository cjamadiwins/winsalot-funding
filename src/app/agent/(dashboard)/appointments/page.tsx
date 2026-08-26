import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { fetchWinsalotReminderStatusMap } from "@/lib/winsalot-consultation-reminders";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";
import type { WinsalotAppointmentListRow } from "@/components/WinsalotAppointmentsListClient";
import AgentAppointmentsClient from "./AgentAppointmentsClient";

// Agent appointment view - only consultations assigned to the signed-in
// agent (winsalot_appointments_agent_select_own RLS), with View/Edit/
// Reschedule/Cancel controls - no Delete, which is admin-only per the
// brief.
export default async function AgentAppointmentsPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("winsalot_appointments")
    .select("*, crm_opportunities(business_name, stage), assigned_agent:crm_users!assigned_agent_id(full_name, email)")
    .order("appointment_start_at", { ascending: true });

  type Row = WinsalotAppointmentRow & {
    crm_opportunities: { business_name: string; stage: string } | null;
    assigned_agent: { full_name: string; email: string } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const reminderStatusMap = await fetchWinsalotReminderStatusMap(supabase, rows);

  const appointments: WinsalotAppointmentListRow[] = rows.map((row) => ({
    ...row,
    opportunityBusinessName: row.crm_opportunities?.business_name ?? null,
    opportunityStage: row.crm_opportunities?.stage ?? null,
    assignedAgentName: row.assigned_agent?.full_name || row.assigned_agent?.email || null,
    reminder24h: reminderStatusMap[row.id]?.reminder24h ?? "scheduled",
    reminder1h: reminderStatusMap[row.id]?.reminder1h ?? "scheduled",
  }));

  return (
    <div>
      <h1 className="font-heading text-[22px] font-bold text-[var(--color-ink-strong)]">My Appointments</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Consultations assigned to you.</p>
      <div className="mt-5">
        <AgentAppointmentsClient appointments={appointments} />
      </div>
    </div>
  );
}
