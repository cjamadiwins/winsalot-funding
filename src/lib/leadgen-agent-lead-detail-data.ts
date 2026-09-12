import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveSiteRelativeUrl } from "@/lib/site-url";
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import {
  getEffectiveBookingLink,
  isHiddenLeadgenCampaignName,
  type LeadgenAppointmentRow,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenEmailRow,
  type LeadgenEmailTemplateRow,
  type LeadgenFollowUpRow,
  type LeadgenLeadActivityRow,
  type LeadgenLeadRow,
} from "@/lib/leadgen-types";
import { fetchLeadgenAppointmentReminderStatusMap, fetchLeadgenAppointmentSmsReminderStatusMap } from "@/lib/leadgen-appointment-reminders";

export type LeadgenAgentLeadDetailData = {
  lead: LeadgenLeadRow;
  client: LeadgenClientRow | null;
  campaign: LeadgenCampaignRow | null;
  activities: LeadgenLeadActivityRow[];
  followUps: LeadgenFollowUpRow[];
  appointments: LeadgenAppointmentRow[];
  automaticReminderStatusByAppointmentId: Awaited<ReturnType<typeof fetchLeadgenAppointmentReminderStatusMap>>;
  smsReminderStatusByAppointmentId: Awaited<ReturnType<typeof fetchLeadgenAppointmentSmsReminderStatusMap>>;
  emails: LeadgenEmailRow[];
  consultationTemplate: LeadgenEmailTemplateRow | null;
  consultationInvitationTemplate: LeadgenEmailTemplateRow | null;
  consultationFollowUpTemplate: LeadgenEmailTemplateRow | null;
  mantraCollabTemplate: LeadgenEmailTemplateRow | null;
  followUpTemplates: LeadgenEmailTemplateRow[];
  bookingLink: string | null;
  servicesInfoLink: string | null;
  bouncedEmails: string[];
  // Not accepted by the agent's own standalone lead detail page (Opportunity
  // Finder scores are only ever shown there for admins) - carried here only
  // so the Opportunity Finder dashboard modal can show the same "why this
  // score" explanation the admin's own detail view already displays.
  score: LeadgenOpportunityScoreRow | null;
};

// One Lead Gen CRM lead's full detail record, scoped to the signed-in
// agent - the exact same query set the standalone
// /leadgen/agent/leads/[id] page uses (the session-scoped client, RLS
// leadgen_leads_agent_select_own, already returns nothing for a lead not
// assigned to this agent). Deliberately separate from
// loadLeadgenLeadDetail (the admin loader, which reads via the
// service-role client and must never be reachable from an agent-facing
// action) rather than a shared function, so this stays permission-safe on
// its own.
export async function loadLeadgenAgentLeadDetail(id: string): Promise<LeadgenAgentLeadDetailData | null> {
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase.from("leadgen_leads").select("*").eq("id", id).maybeSingle();
  if (!lead) return null;

  const [
    { data: client },
    { data: campaign },
    { data: activities },
    { data: followUps },
    { data: appointments },
    { data: emails },
    { data: consultationTemplate },
    { data: consultationInvitationTemplate },
    { data: consultationFollowUpTemplate },
    { data: mantraCollabTemplate },
    { data: followUpTemplates },
    { data: score },
  ] = await Promise.all([
    supabase.from("leadgen_clients").select("*").eq("id", lead.client_id).maybeSingle(),
    lead.campaign_id ? supabase.from("leadgen_campaigns").select("*").eq("id", lead.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("leadgen_lead_activities").select("*").eq("lead_id", id).order("occurred_at", { ascending: false }),
    supabase.from("leadgen_followups").select("*").eq("lead_id", id).order("scheduled_at", { ascending: true }),
    supabase.from("leadgen_appointments").select("*").eq("lead_id", id).order("appointment_date", { ascending: false }),
    supabase.from("leadgen_emails").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("leadgen_email_templates").select("*").eq("key", "consultation_information").maybeSingle(),
    supabase.from("leadgen_email_templates").select("*").eq("key", "consultation_invitation").maybeSingle(),
    supabase.from("leadgen_email_templates").select("*").eq("key", "consultation_follow_up").maybeSingle(),
    supabase.from("leadgen_email_templates").select("*").eq("key", "mantra_collab_intro").maybeSingle(),
    supabase.from("leadgen_email_templates").select("*").eq("active", true).ilike("key", "%follow%up%").order("name"),
    supabase.from("leadgen_opportunity_scores").select("*").eq("lead_id", id).maybeSingle(),
  ]);

  const { data: bouncedRows } = await supabase.from("leadgen_bounced_emails").select("email").is("cleared_at", null);
  const automaticReminderStatusByAppointmentId = await fetchLeadgenAppointmentReminderStatusMap(supabase, (appointments ?? []) as LeadgenAppointmentRow[]);
  const smsReminderStatusByAppointmentId = await fetchLeadgenAppointmentSmsReminderStatusMap(supabase, (appointments ?? []) as LeadgenAppointmentRow[]);

  const visibleCampaign = campaign && !isHiddenLeadgenCampaignName((campaign as LeadgenCampaignRow).name) ? campaign : null;
  const bookingLink = client ? resolveSiteRelativeUrl(getEffectiveBookingLink(client as LeadgenClientRow, visibleCampaign as LeadgenCampaignRow | null)) : null;

  return {
    lead: lead as LeadgenLeadRow,
    client: client as LeadgenClientRow | null,
    campaign: visibleCampaign as LeadgenCampaignRow | null,
    activities: (activities ?? []) as LeadgenLeadActivityRow[],
    followUps: (followUps ?? []) as LeadgenFollowUpRow[],
    appointments: (appointments ?? []) as LeadgenAppointmentRow[],
    automaticReminderStatusByAppointmentId,
    smsReminderStatusByAppointmentId,
    emails: (emails ?? []) as LeadgenEmailRow[],
    consultationTemplate: consultationTemplate as LeadgenEmailTemplateRow | null,
    consultationInvitationTemplate: consultationInvitationTemplate as LeadgenEmailTemplateRow | null,
    consultationFollowUpTemplate: consultationFollowUpTemplate as LeadgenEmailTemplateRow | null,
    mantraCollabTemplate: mantraCollabTemplate as LeadgenEmailTemplateRow | null,
    followUpTemplates: (followUpTemplates ?? []) as LeadgenEmailTemplateRow[],
    bookingLink,
    servicesInfoLink: (client as LeadgenClientRow)?.services_info_link ?? null,
    bouncedEmails: (bouncedRows ?? []).map((r) => r.email),
    score: score as LeadgenOpportunityScoreRow | null,
  };
}
