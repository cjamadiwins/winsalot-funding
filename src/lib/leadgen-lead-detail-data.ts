import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import { fetchLeadgenAppointmentReminderStatusMap, fetchLeadgenAppointmentSmsReminderStatusMap } from "@/lib/leadgen-appointment-reminders";
import { checkDncSuppression, type DncSuppressionRow } from "@/lib/dnc-suppression";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export type LeadgenLeadDetailData = {
  lead: LeadgenLeadRow;
  client: LeadgenClientRow | null;
  campaign: LeadgenCampaignRow | null;
  agents: LeadgenUserRow[];
  assignedAgentName: string | null;
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
  score: LeadgenOpportunityScoreRow | null;
  // Shared cross-CRM Do Not Contact restriction (crm_dnc_suppressions),
  // looked up by this lead's phone/email - null when unrestricted.
  dncSuppression: DncSuppressionRow | null;
};

// One Lead Gen CRM lead's full detail record - the exact same query set
// the standalone /leadgen/admin/leads/[id] page uses, extracted here so
// the Opportunity Finder dashboard modal's "View Lead" can fetch the same
// record on demand (via a server action) without duplicating this query
// logic or introducing a second, lighter detail view. Also used by the
// agent-side lead detail page/modal, which reads the same table set (RLS
// there already scopes leadgen_leads/activities/followups/appointments/
// emails to the signed-in agent's own leads).
export async function loadLeadgenLeadDetail(id: string): Promise<LeadgenLeadDetailData | null> {
  const admin = getSupabaseAdmin();

  const { data: lead } = await admin.from("leadgen_leads").select("*").eq("id", id).maybeSingle();
  if (!lead) return null;

  const [
    { data: client },
    { data: campaign },
    { data: agents },
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
    admin.from("leadgen_clients").select("*").eq("id", lead.client_id).maybeSingle(),
    lead.campaign_id
      ? admin.from("leadgen_campaigns").select("*").eq("id", lead.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("leadgen_users").select("*").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL).order("full_name"),
    admin.from("leadgen_lead_activities").select("*").eq("lead_id", id).order("occurred_at", { ascending: false }),
    admin.from("leadgen_followups").select("*").eq("lead_id", id).order("scheduled_at", { ascending: true }),
    admin.from("leadgen_appointments").select("*").eq("lead_id", id).order("appointment_date", { ascending: false }),
    admin.from("leadgen_emails").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    admin.from("leadgen_email_templates").select("*").eq("key", "consultation_information").maybeSingle(),
    admin.from("leadgen_email_templates").select("*").eq("key", "consultation_invitation").maybeSingle(),
    admin.from("leadgen_email_templates").select("*").eq("key", "consultation_follow_up").maybeSingle(),
    admin.from("leadgen_email_templates").select("*").eq("key", "mantra_collab_intro").maybeSingle(),
    admin.from("leadgen_email_templates").select("*").eq("active", true).ilike("key", "%follow%up%").order("name"),
    admin.from("leadgen_opportunity_scores").select("*").eq("lead_id", id).maybeSingle(),
  ]);

  const { data: bouncedRows } = await admin.from("leadgen_bounced_emails").select("email").is("cleared_at", null);
  const automaticReminderStatusByAppointmentId = await fetchLeadgenAppointmentReminderStatusMap(admin, (appointments ?? []) as LeadgenAppointmentRow[]);
  const smsReminderStatusByAppointmentId = await fetchLeadgenAppointmentSmsReminderStatusMap(admin, (appointments ?? []) as LeadgenAppointmentRow[]);
  const dncSuppression = await checkDncSuppression({ phone: lead.phone, email: lead.email });

  const assignedAgent = lead.assigned_agent_id ? (agents ?? []).find((a) => a.id === lead.assigned_agent_id) : null;
  const visibleCampaign = campaign && !isHiddenLeadgenCampaignName((campaign as LeadgenCampaignRow).name) ? campaign : null;
  const bookingLink = client ? resolveSiteRelativeUrl(getEffectiveBookingLink(client as LeadgenClientRow, visibleCampaign as LeadgenCampaignRow | null)) : null;

  return {
    lead: lead as LeadgenLeadRow,
    client: client as LeadgenClientRow | null,
    campaign: visibleCampaign as LeadgenCampaignRow | null,
    agents: (agents ?? []) as LeadgenUserRow[],
    assignedAgentName: assignedAgent?.full_name ?? null,
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
    dncSuppression,
  };
}
