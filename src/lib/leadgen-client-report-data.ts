import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadgenAppointmentRow, LeadgenCampaignRow, LeadgenClientRow, LeadgenLeadRow, LeadgenClientOpportunityRow } from "./leadgen-types";
import { buildLeadgenClientReport, type LeadgenReportPeriod } from "./leadgen-client-report";
import { computeFeedbackMetrics, type AppointmentFeedbackRow } from "./leadgen-appointment-prep";

export async function loadLeadgenClientReport(
  supabase: SupabaseClient,
  client: LeadgenClientRow,
  period: LeadgenReportPeriod
) {
  const [
    { data: leads, error: leadsError },
    { data: appointments, error: appointmentsError },
    { data: campaigns, error: campaignsError },
    { data: opportunities, error: opportunitiesError },
  ] = await Promise.all([
    supabase.from("leadgen_leads").select("*").eq("client_id", client.id),
    supabase.from("leadgen_appointments").select("*").eq("client_id", client.id),
    supabase.from("leadgen_campaigns").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
    supabase.from("leadgen_client_opportunities").select("*").eq("client_id", client.id),
  ]);

  const error = leadsError ?? appointmentsError ?? campaignsError ?? opportunitiesError;
  if (error) throw new Error(error.message);

  const report = buildLeadgenClientReport({
    client,
    period,
    leads: (leads ?? []) as LeadgenLeadRow[],
    appointments: (appointments ?? []) as LeadgenAppointmentRow[],
    campaigns: (campaigns ?? []) as LeadgenCampaignRow[],
    opportunities: (opportunities ?? []) as LeadgenClientOpportunityRow[],
  });

  // Appointment feedback is additive: a failed/blocked read here (e.g. the
  // migration not applied yet) must never break the existing report.
  const { data: feedback, error: feedbackError } = await supabase
    .from("leadgen_appointment_feedback")
    .select("appointment_id, outcome, opportunity_quality")
    .eq("client_id", client.id);
  if (!feedbackError) {
    report.appointmentFeedback = computeFeedbackMetrics(report.appointments, (feedback ?? []) as Pick<AppointmentFeedbackRow, "appointment_id" | "outcome" | "opportunity_quality">[]);
  }
  return report;
}
