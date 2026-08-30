import { isLeadgenAppointmentCountable, type LeadgenAppointmentRow, type LeadgenLeadRow } from "./leadgen-types";

// Shared by the real Client Portal dashboard (src/app/client/(portal)/
// dashboard/page.tsx) and the Growth CRM's read-only "View as Client"
// admin preview (src/app/admin/(dashboard)/crm/clients/[id]/portal-preview/
// page.tsx), so the two can never drift into showing different numbers for
// the same underlying leads/appointments.
export type ClientDashboardStat = { label: string; value: number };

export type ClientDashboardSummary = {
  stats: ClientDashboardStat[];
  upcomingAppointments: LeadgenAppointmentRow[];
};

export function computeClientDashboardSummary(leads: LeadgenLeadRow[], appointments: LeadgenAppointmentRow[]): ClientDashboardSummary {
  const businessesContacted = leads.filter((l) => l.last_contacted_at).length;
  const interestedBusinesses = leads.filter((l) => l.status === "Interested").length;
  const followUps = leads.filter((l) => l.next_follow_up_at).length;
  const appointmentsBooked = appointments.filter((a) => isLeadgenAppointmentCountable(a.status)).length;
  const appointmentsCompleted = appointments.filter((a) => a.status === "Completed").length;
  const conversionRate = businessesContacted > 0 ? Math.round((appointmentsCompleted / businessesContacted) * 100) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const upcomingAppointments = appointments
    .filter((a) => a.appointment_date >= today && isLeadgenAppointmentCountable(a.status) && a.status !== "Completed")
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));

  return {
    stats: [
      { label: "Total Leads", value: leads.length },
      { label: "Leads Contacted", value: businessesContacted },
      { label: "Interested Leads", value: interestedBusinesses },
      { label: "Follow-Ups", value: followUps },
      { label: "Appointments Booked", value: appointmentsBooked },
      { label: "Completed Appointments", value: appointmentsCompleted },
      { label: "Conversion Rate", value: conversionRate },
    ],
    upcomingAppointments,
  };
}

// "Owner reached" is kept as a secondary stat on the real dashboard
// (matches the pre-existing page's wording) without being one of the
// brief's seven named KPIs above.
export function ownersReachedCount(leads: LeadgenLeadRow[]): number {
  return leads.filter((l) => l.status === "Owner reached").length;
}
