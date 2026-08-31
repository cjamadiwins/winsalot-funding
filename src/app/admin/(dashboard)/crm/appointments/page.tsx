import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchWinsalotReminderStatusMap } from "@/lib/winsalot-consultation-reminders";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";
import type { WinsalotAppointmentListRow } from "@/components/WinsalotAppointmentsListClient";
import type { BookableOpportunity } from "./AdminAppointmentsClient";
import AdminAppointmentsClient from "./AdminAppointmentsClient";

// Admin appointment view - every Winsalot consultation booking, agent-
// booked and self-booked alike, with full View/Edit/Reschedule/Cancel/
// Delete controls. Delete is admin-only per the brief.
export default async function AdminAppointmentsPage({
  searchParams,
}: {
  // Set by the CRM dashboard's "Book Call / Appointment" button
  // (?openAdd=1) - auto-expands the "Book Appointment" picker below so
  // that click lands directly in the booking workflow, matching the Lead
  // Generation CRM's Appointments page convention.
  searchParams: Promise<{ openAdd?: string }>;
}) {
  await requireCrmAdmin();
  const { openAdd } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data }, { data: opportunitiesData }] = await Promise.all([
    supabase
      .from("winsalot_appointments")
      .select("*, crm_opportunities(business_name, stage), assigned_agent:crm_users!assigned_agent_id(full_name, email)")
      .order("appointment_start_at", { ascending: true }),
    // For the "Book Appointment" prospect picker below - every opportunity,
    // same unfiltered roster the agent's own Book Consultation flow already
    // offers from an opportunity's own detail page.
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
      <h1 className="text-2xl font-bold text-slate-900">Consultation Appointments</h1>
      <p className="mt-1 text-sm text-slate-500">Every Winsalot consultation booking, agent-booked and self-booked alike.</p>
      <div className="mt-6">
        <AdminAppointmentsClient
          appointments={appointments}
          opportunities={(opportunitiesData ?? []) as BookableOpportunity[]}
          initialOpenAdd={openAdd === "1"}
        />
      </div>
    </div>
  );
}
