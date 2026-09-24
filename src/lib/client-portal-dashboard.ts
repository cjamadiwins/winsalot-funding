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

// "Upcoming" = booked and not yet resolved: today or later, an active
// (countable) scheduling status, and not already Completed. Shared by the
// Dashboard's "Upcoming Appointments" list, its "Appointments Booked" KPI
// count, and the Appointments page's `?filter=upcoming` tab, so the three
// can never disagree about which appointments count as upcoming.
export function isUpcomingLeadgenAppointment(appointment: LeadgenAppointmentRow, today: string = new Date().toISOString().slice(0, 10)): boolean {
  return appointment.appointment_date >= today && isLeadgenAppointmentCountable(appointment.status) && appointment.status !== "Completed";
}

// A lead has *a* follow-up on the books, due today, in the future, or
// overdue - matches the Dashboard's existing "Follow-Ups" KPI exactly, so
// clicking that card into My Leads' `?filter=follow-up` tab always shows
// the same count the card just showed.
export function needsFollowUpLeadgenLead(lead: LeadgenLeadRow): boolean {
  return Boolean(lead.next_follow_up_at);
}

export function computeClientDashboardSummary(leads: LeadgenLeadRow[], appointments: LeadgenAppointmentRow[]): ClientDashboardSummary {
  const businessesContacted = leads.filter((l) => l.last_contacted_at).length;
  const interestedBusinesses = leads.filter((l) => l.status === "Interested").length;
  const followUps = leads.filter((l) => needsFollowUpLeadgenLead(l)).length;
  const appointmentsBooked = appointments.filter((a) => isLeadgenAppointmentCountable(a.status)).length;
  const appointmentsCompleted = appointments.filter((a) => a.status === "Completed").length;
  const conversionRate = businessesContacted > 0 ? Math.round((appointmentsCompleted / businessesContacted) * 100) : 0;

  const upcomingAppointments = appointments
    .filter((a) => isUpcomingLeadgenAppointment(a))
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
