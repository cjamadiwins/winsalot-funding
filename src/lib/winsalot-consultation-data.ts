import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WinsalotAppointmentRow } from "./winsalot-consultation-types";

// Root-cause fix for the Growth CRM dashboard's "Consultations Booked"
// card: it used to count crm_opportunities rows whose `stage` happened to
// equal "Consultation Booked" and, on click, just re-filtered the generic
// opportunities table by that same stage - never the actual appointment
// records (date/time, cancelled/booked status) in winsalot_appointments.
// An opportunity can sit at that stage with zero appointments (never
// actually booked, or the appointment was later cancelled without the
// stage being rolled back) or, after a reschedule, more than one - so the
// stage-based count and the real "how many consultations are booked right
// now" answer could diverge. This is the one place that answer is
// computed: a genuine `status = 'booked'` row in winsalot_appointments,
// nothing else. Both the dashboard's card count and its drill-down modal
// read this exact same array, so they can never disagree again.
export type ConsultationCardRecord = WinsalotAppointmentRow & {
  opportunityBusinessName: string | null;
  opportunityStage: string | null;
  assignedAgentName: string | null;
};

// Session client only - RLS (winsalot_appointments_admin_all /
// winsalot_appointments_agent_select_own) is what actually scopes this to
// "every agent" for an admin caller or "just this agent's own" for an
// agent caller, exactly like /admin/crm/appointments and
// /agent/appointments already rely on for the same table.
export async function getBookedConsultationRecords(supabase: SupabaseClient): Promise<ConsultationCardRecord[]> {
  const { data, error } = await supabase
    .from("winsalot_appointments")
    .select("*, crm_opportunities(business_name, stage), assigned_agent:crm_users!assigned_agent_id(full_name, email)")
    .eq("status", "booked")
    .order("appointment_start_at", { ascending: true });

  if (error || !data) return [];

  type Row = WinsalotAppointmentRow & {
    crm_opportunities: { business_name: string; stage: string } | null;
    assigned_agent: { full_name: string; email: string } | null;
  };

  return (data as unknown as Row[]).map((row) => ({
    ...row,
    opportunityBusinessName: row.crm_opportunities?.business_name ?? null,
    opportunityStage: row.crm_opportunities?.stage ?? null,
    assignedAgentName: row.assigned_agent?.full_name || row.assigned_agent?.email || null,
  }));
}

// "Upcoming appointments first" - soonest-first among appointments still
// ahead of now, then anything already past its start time (booked but not
// yet updated/completed) most-recent-first after that.
export function sortConsultationsUpcomingFirst(records: ConsultationCardRecord[]): ConsultationCardRecord[] {
  const now = Date.now();
  return records.slice().sort((a, b) => {
    const aTime = new Date(a.appointment_start_at).getTime();
    const bTime = new Date(b.appointment_start_at).getTime();
    const aUpcoming = aTime >= now;
    const bUpcoming = bTime >= now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? aTime - bTime : bTime - aTime;
  });
}
