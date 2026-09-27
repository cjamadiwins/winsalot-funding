import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdmins } from "./crm-retention-notifications";
import {
  fetchCommunicationFailures,
  fetchStaleOpportunities,
  fetchAppointmentRisks,
  fetchDataQualityIssues,
  fetchClientCampaignActivity,
} from "./crm-monitoring-data";
import { deriveCommunicationMonitoringStatus, deriveDataQualityStatus } from "./crm-monitoring";

// Operations Monitoring escalation sweep (Growth CRM) - "Do NOT email
// Admin for every warning... only escalate serious conditions through the
// existing Admin notification system." Reuses notifyAdmins() (the same
// in-app crm_notifications helper the Client Loyalty & Retention feature
// already uses), which itself only ever inserts one row per admin per
// distinct (title, link_path) while it's still unread - so running this
// sweep daily never piles up duplicate notifications for a condition an
// admin simply hasn't looked at yet, and a still-true condition is free to
// notify again once it's been read and dismissed.
//
// This never sends an email itself and never changes any monitored
// record - it only reads the same bounded queries the dashboard/detail
// page already use and, for the "Action Required" tier of each area,
// writes one aggregate in-app notification.
export async function runCrmOperationsMonitoringEscalations(admin: SupabaseClient): Promise<void> {
  const [failures, staleLeads, appointmentRisks, dataQualityIssues, clientCampaigns] = await Promise.all([
    fetchCommunicationFailures(admin),
    fetchStaleOpportunities(admin),
    fetchAppointmentRisks(admin),
    fetchDataQualityIssues(admin),
    fetchClientCampaignActivity(admin),
  ]);

  if (deriveCommunicationMonitoringStatus(failures.length) === "Action Required") {
    await notifyAdmins(admin, {
      title: "Repeated email/SMS delivery failures",
      body: `${failures.length} email/SMS failures in the last 7 days. Review Operations Monitoring for details.`,
      linkPath: "/admin/crm/monitoring?tab=communications",
    });
  }

  const overdueLeads = staleLeads.filter((r) => r.status === "Action Required");
  if (overdueLeads.length > 0) {
    await notifyAdmins(admin, {
      title: "Leads seriously overdue for follow-up",
      body: `${overdueLeads.length} lead(s) have had no meaningful activity for 3+ business days.`,
      linkPath: "/admin/crm/monitoring?tab=stale-leads",
    });
  }

  const urgentAppointments = appointmentRisks.filter((r) => r.monitoringStatus === "Action Required");
  if (urgentAppointments.length > 0) {
    await notifyAdmins(admin, {
      title: "Appointment reminder failures need attention",
      body: `${urgentAppointments.length} appointment(s) have a failed reminder or a long-overdue follow-up.`,
      linkPath: "/admin/crm/monitoring?tab=appointments",
    });
  }

  if (deriveDataQualityStatus(dataQualityIssues.length) === "Action Required") {
    await notifyAdmins(admin, {
      title: "Unusual data quality issue detected",
      body: `${dataQualityIssues.length} opportunity records are missing key details or look like duplicates - this is a larger batch than usual.`,
      linkPath: "/admin/crm/monitoring?tab=data-quality",
    });
  }

  const stalledCampaigns = clientCampaigns.filter((r) => r.status === "Action Required");
  if (stalledCampaigns.length > 0) {
    await notifyAdmins(admin, {
      title: "Active client campaign(s) show continued inactivity",
      body: `${stalledCampaigns.length} active client(s) have had no recorded activity for 2+ business days: ${stalledCampaigns
        .slice(0, 5)
        .map((c) => c.companyName)
        .join(", ")}.`,
      linkPath: "/admin/crm/monitoring?tab=client-campaigns",
    });
  }
}
