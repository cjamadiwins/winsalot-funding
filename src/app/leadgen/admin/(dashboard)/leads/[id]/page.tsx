import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
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
import LeadDetailClient, { type LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import { assignLeadAction, deleteLeadgenLeadAction } from "../actions";
import { clearBouncedEmailAction, resendLeadgenEmailAction } from "../../actions";
import { bookAppointmentAction, resendAppointmentNotificationAction, sendAppointmentReminderAction } from "../../appointments/actions";
import { fetchLeadgenAppointmentReminderStatusMap, fetchLeadgenAppointmentSmsReminderStatusMap } from "@/lib/leadgen-appointment-reminders";
import {
  completeFollowUpAction,
  recordCallOutcomeAction,
  scheduleFollowUpAction,
  sendConsultationEmailAction,
  sendConsultationFollowUpAction,
  sendConsultationInvitationAction,
  sendMantraCollabIntroEmailAction,
  updateLeadAction,
} from "./actions";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

const actions: LeadDetailActions = {
  updateLead: updateLeadAction,
  recordCallOutcome: recordCallOutcomeAction,
  scheduleFollowUp: scheduleFollowUpAction,
  completeFollowUp: completeFollowUpAction,
  bookAppointment: bookAppointmentAction,
  sendConsultationEmail: sendConsultationEmailAction,
  sendConsultationInvitation: sendConsultationInvitationAction,
  sendConsultationFollowUp: sendConsultationFollowUpAction,
  sendMantraCollabIntro: sendMantraCollabIntroEmailAction,
  resendEmail: resendLeadgenEmailAction,
  assignAgent: assignLeadAction,
  clearBouncedEmail: clearBouncedEmailAction,
  deleteLead: deleteLeadgenLeadAction,
  resendAppointmentNotification: resendAppointmentNotificationAction,
  sendAppointmentReminder: sendAppointmentReminderAction,
};

export default async function LeadgenAdminLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const adminUser = await requireLeadgenAdmin();
  const { id } = await params;
  const { from } = await searchParams;
  const admin = getSupabaseAdmin();

  const { data: lead } = await admin.from("leadgen_leads").select("*").eq("id", id).maybeSingle();
  if (!lead) {
    const backHref = from === "opportunity-finder" ? "/leadgen/admin/opportunity-finder" : "/leadgen/admin/leads";
    const backLabel = from === "opportunity-finder" ? "Back to Opportunity Finder" : "Back to Leads";
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-8 text-center">
        <h1 className="text-lg font-bold text-slate-900">Business record not found</h1>
        <p className="mt-2 text-sm text-slate-500">This lead may have been deleted, or the link may be incorrect.</p>
        <Link
          href={backHref}
          className="mt-5 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          ← {backLabel}
        </Link>
      </div>
    );
  }

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
    // Opportunity Finder's own score for this lead, if it's been scored
    // yet - same leadgen_opportunity_scores row the Opportunity Finder
    // table already reads (see opportunity-finder/page.tsx).
    admin.from("leadgen_opportunity_scores").select("*").eq("lead_id", id).maybeSingle(),
  ]);

  const { data: bouncedRows } = await admin.from("leadgen_bounced_emails").select("email").is("cleared_at", null);
  const automaticReminderStatusByAppointmentId = await fetchLeadgenAppointmentReminderStatusMap(admin, (appointments ?? []) as LeadgenAppointmentRow[]);
  const smsReminderStatusByAppointmentId = await fetchLeadgenAppointmentSmsReminderStatusMap(admin, (appointments ?? []) as LeadgenAppointmentRow[]);

  const assignedAgent = lead.assigned_agent_id ? (agents ?? []).find((a) => a.id === lead.assigned_agent_id) : null;
  const visibleCampaign = campaign && !isHiddenLeadgenCampaignName((campaign as LeadgenCampaignRow).name) ? campaign : null;
  const bookingLink = client ? resolveSiteRelativeUrl(getEffectiveBookingLink(client as LeadgenClientRow, visibleCampaign as LeadgenCampaignRow | null)) : null;

  return (
    <LeadDetailClient
      lead={lead as LeadgenLeadRow}
      client={client as LeadgenClientRow}
      campaign={visibleCampaign as LeadgenCampaignRow | null}
      agents={(agents ?? []) as LeadgenUserRow[]}
      assignedAgentName={assignedAgent?.full_name ?? null}
      currentUserName={adminUser.full_name || adminUser.email}
      currentUserId={adminUser.id}
      activities={(activities ?? []) as LeadgenLeadActivityRow[]}
      followUps={(followUps ?? []) as LeadgenFollowUpRow[]}
      appointments={(appointments ?? []) as LeadgenAppointmentRow[]}
      automaticReminderStatusByAppointmentId={automaticReminderStatusByAppointmentId}
      smsReminderStatusByAppointmentId={smsReminderStatusByAppointmentId}
      emails={(emails ?? []) as LeadgenEmailRow[]}
      consultationTemplate={consultationTemplate as LeadgenEmailTemplateRow | null}
      consultationInvitationTemplate={consultationInvitationTemplate as LeadgenEmailTemplateRow | null}
      consultationFollowUpTemplate={consultationFollowUpTemplate as LeadgenEmailTemplateRow | null}
      mantraCollabTemplate={mantraCollabTemplate as LeadgenEmailTemplateRow | null}
      followUpTemplates={(followUpTemplates ?? []) as LeadgenEmailTemplateRow[]}
      bookingLink={bookingLink}
      servicesInfoLink={(client as LeadgenClientRow)?.services_info_link ?? null}
      bouncedEmails={(bouncedRows ?? []).map((r) => r.email)}
      isAdmin
      actions={actions}
      listPath="/leadgen/admin/leads"
      score={score as LeadgenOpportunityScoreRow | null}
    />
  );
}
