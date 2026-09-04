import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { fetchWinsalotReminderStatusMap, fetchWinsalotSmsReminderStatusMap } from "@/lib/winsalot-consultation-reminders";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";
import type { WinsalotAppointmentListRow } from "@/components/WinsalotAppointmentsListClient";
import type { BookableOpportunity } from "./AgentAppointmentsClient";
import AgentAppointmentsClient from "./AgentAppointmentsClient";

// Agent appointment view - only consultations assigned to the signed-in
// agent (winsalot_appointments_agent_select_own RLS), with View/Edit/
// Reschedule/Cancel controls - no Delete, which is admin-only per the
// brief.
export default async function AgentAppointmentsPage({
  searchParams,
}: {
  // Set by the agent dashboard's "Book Call / Appointment" button
  // (?openAdd=1) - auto-expands the "Book Appointment" picker below.
  searchParams: Promise<{ openAdd?: string }>;
}) {
  await requireCrmUser();
  const { openAdd } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data }, { data: opportunitiesData }] = await Promise.all([
    supabase
      .from("winsalot_appointments")
      .select("*, crm_opportunities(business_name, stage), assigned_agent:crm_users!assigned_agent_id(full_name, email)")
      .order("appointment_start_at", { ascending: true }),
    // For the "Book Appointment" prospect picker below - RLS
    // (crm_opportunities_agent_select_own) already scopes this to only
    // opportunities assigned to the signed-in agent, same as everywhere
    // else in the agent CRM.
    supabase
      .from("crm_opportunities")
      .select("id, business_name, contact_name, email, phone, opportunity_type")
      .order("business_name"),
  ]);

  type Row = WinsalotAppointmentRow & {
    crm_opportunities: { business_name: string; stage: string } | null;
    assigned_agent: { full_name: string; email: string } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const [reminderStatusMap, smsReminderStatusMap] = await Promise.all([
    fetchWinsalotReminderStatusMap(supabase, rows),
    fetchWinsalotSmsReminderStatusMap(supabase, rows),
  ]);

  const appointments: WinsalotAppointmentListRow[] = rows.map((row) => ({
    ...row,
    opportunityBusinessName: row.crm_opportunities?.business_name ?? null,
    opportunityStage: row.crm_opportunities?.stage ?? null,
    assignedAgentName: row.assigned_agent?.full_name || row.assigned_agent?.email || null,
    reminder24h: reminderStatusMap[row.id]?.reminder24h ?? "scheduled",
    reminder1h: reminderStatusMap[row.id]?.reminder1h ?? "scheduled",
    reminder24hError: reminderStatusMap[row.id]?.reminder24hError ?? null,
    reminder1hError: reminderStatusMap[row.id]?.reminder1hError ?? null,
    smsReminder24h: smsReminderStatusMap[row.id]?.status24h ?? "Scheduled",
    smsReminder1h: smsReminderStatusMap[row.id]?.status1h ?? "Scheduled",
    smsReminder24hError: smsReminderStatusMap[row.id]?.errorDetail24h ?? null,
    smsReminder1hError: smsReminderStatusMap[row.id]?.errorDetail1h ?? null,
  }));

  return (
    <div>
      <h1 className="font-heading text-[22px] font-bold text-[var(--color-ink-strong)]">My Appointments</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Consultations assigned to you.</p>
      <div className="mt-5">
        <AgentAppointmentsClient
          appointments={appointments}
          opportunities={(opportunitiesData ?? []) as BookableOpportunity[]}
          initialOpenAdd={openAdd === "1"}
        />
      </div>
    </div>
  );
}
