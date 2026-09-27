import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCommunicationFailures,
  fetchStaleLeads,
  fetchAppointmentRisks,
  fetchDataQualityIssues,
  fetchCampaignActivity,
} from "./leadgen-monitoring-data";
import { deriveCommunicationMonitoringStatus, deriveDataQualityStatus } from "./leadgen-monitoring";

// Reuses the existing leadgen_notifications table (migration 0071) - no
// new notifications system, per the brief's "reuse existing... where
// possible." Mirrors the Growth CRM's notifyAdmins() (crm-retention-notifications.ts)
// dedupe-by-(user, title, link_path)-while-unread technique exactly, since
// no equivalent generic helper exists yet for this CRM's notification
// table (the existing leadgen-agent-activity-notifications.ts helpers are
// narrower, single-purpose fan-outs with no dedupe of their own).
async function notifyLeadgenAdmins(admin: SupabaseClient, input: { title: string; body: string; linkPath: string }): Promise<void> {
  const { data: admins } = await admin.from("leadgen_users").select("id").eq("role", "admin").eq("active", true);
  if (!admins || admins.length === 0) return;

  for (const row of admins as { id: string }[]) {
    const { data: existing } = await admin
      .from("leadgen_notifications")
      .select("id")
      .eq("user_id", row.id)
      .eq("link_path", input.linkPath)
      .eq("title", input.title)
      .eq("is_read", false)
      .maybeSingle();
    if (existing) continue;

    await admin.from("leadgen_notifications").insert({ user_id: row.id, title: input.title, body: input.body, link_path: input.linkPath });
  }
}

// Operations Monitoring escalation sweep (Lead Generation CRM) - same
// "only escalate Action Required conditions, one aggregate notification
// per area" design as the Growth CRM's runCrmOperationsMonitoringEscalations.
// Never sends an email and never changes a monitored record.
export async function runLeadgenOperationsMonitoringEscalations(admin: SupabaseClient): Promise<void> {
  const [failures, staleLeads, appointmentRisks, dataQualityIssues, campaigns] = await Promise.all([
    fetchCommunicationFailures(admin),
    fetchStaleLeads(admin),
    fetchAppointmentRisks(admin),
    fetchDataQualityIssues(admin),
    fetchCampaignActivity(admin),
  ]);

  if (deriveCommunicationMonitoringStatus(failures.length) === "Action Required") {
    await notifyLeadgenAdmins(admin, {
      title: "Repeated email/SMS delivery failures",
      body: `${failures.length} email/SMS failures in the last 7 days. Review Operations Monitoring for details.`,
      linkPath: "/leadgen/admin/monitoring?tab=communications",
    });
  }

  const overdueLeads = staleLeads.filter((r) => r.status === "Action Required");
  if (overdueLeads.length > 0) {
    await notifyLeadgenAdmins(admin, {
      title: "Leads seriously overdue for follow-up",
      body: `${overdueLeads.length} lead(s) have had no meaningful activity for 3+ business days.`,
      linkPath: "/leadgen/admin/monitoring?tab=stale-leads",
    });
  }

  const urgentAppointments = appointmentRisks.filter((r) => r.monitoringStatus === "Action Required");
  if (urgentAppointments.length > 0) {
    await notifyLeadgenAdmins(admin, {
      title: "Appointment reminder failures need attention",
      body: `${urgentAppointments.length} appointment(s) have a failed reminder.`,
      linkPath: "/leadgen/admin/monitoring?tab=appointments",
    });
  }

  if (deriveDataQualityStatus(dataQualityIssues.length) === "Action Required") {
    await notifyLeadgenAdmins(admin, {
      title: "Unusual data quality issue detected",
      body: `${dataQualityIssues.length} lead records are missing key details or look like duplicates - this is a larger batch than usual.`,
      linkPath: "/leadgen/admin/monitoring?tab=data-quality",
    });
  }

  const stalledCampaigns = campaigns.filter((r) => r.status === "Action Required");
  if (stalledCampaigns.length > 0) {
    await notifyLeadgenAdmins(admin, {
      title: "Active client campaign(s) show continued inactivity",
      body: `${stalledCampaigns.length} active campaign(s) have had no recorded activity for 2+ business days: ${stalledCampaigns
        .slice(0, 5)
        .map((c) => `${c.campaignName} (${c.clientName})`)
        .join(", ")}.`,
      linkPath: "/leadgen/admin/monitoring?tab=client-campaigns",
    });
  }
}
