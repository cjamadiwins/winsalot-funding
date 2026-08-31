import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadgenAppointmentRow, LeadgenCampaignRow, LeadgenClientRow, LeadgenLeadRow } from "./leadgen-types";
import { buildLeadgenClientReport, type LeadgenReportPeriod } from "./leadgen-client-report";

export async function loadLeadgenClientReport(
  supabase: SupabaseClient,
  client: LeadgenClientRow,
  period: LeadgenReportPeriod
) {
  const [{ data: leads, error: leadsError }, { data: appointments, error: appointmentsError }, { data: campaigns, error: campaignsError }] =
    await Promise.all([
      supabase.from("leadgen_leads").select("*").eq("client_id", client.id),
      supabase.from("leadgen_appointments").select("*").eq("client_id", client.id),
      supabase.from("leadgen_campaigns").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
    ]);

  const error = leadsError ?? appointmentsError ?? campaignsError;
  if (error) throw new Error(error.message);

  return buildLeadgenClientReport({
    client,
    period,
    leads: (leads ?? []) as LeadgenLeadRow[],
    appointments: (appointments ?? []) as LeadgenAppointmentRow[],
    campaigns: (campaigns ?? []) as LeadgenCampaignRow[],
  });
}
