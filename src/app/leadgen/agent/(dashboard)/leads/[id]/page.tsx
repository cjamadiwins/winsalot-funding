import { notFound } from "next/navigation";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getEffectiveBookingLink,
  type LeadgenAppointmentRow,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenEmailRow,
  type LeadgenEmailTemplateRow,
  type LeadgenFollowUpRow,
  type LeadgenLeadActivityRow,
  type LeadgenLeadRow,
} from "@/lib/leadgen-types";
import LeadDetailClient, { type LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import { bookAppointmentAction } from "../../appointments/actions";
import {
  completeFollowUpAction,
  recordCallOutcomeAction,
  scheduleFollowUpAction,
  sendConsultationEmailAction,
  sendConsultationFollowUpAction,
  sendConsultationInvitationAction,
  updateLeadAction,
} from "./actions";

const actions: LeadDetailActions = {
  updateLead: updateLeadAction,
  recordCallOutcome: recordCallOutcomeAction,
  scheduleFollowUp: scheduleFollowUpAction,
  completeFollowUp: completeFollowUpAction,
  bookAppointment: bookAppointmentAction,
  sendConsultationEmail: sendConsultationEmailAction,
  sendConsultationInvitation: sendConsultationInvitationAction,
  sendConsultationFollowUp: sendConsultationFollowUpAction,
  // No resendEmail / assignAgent - agents can't resend a failed prospect
  // email (admin-only per the brief) or reassign a lead.
};

export default async function LeadgenAgentLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireLeadgenAgent();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_leads_agent_select_own) already scopes this to a lead
  // actually assigned to this agent - a lead that isn't theirs (or
  // doesn't exist) simply returns null here, same layered-defense
  // pattern as the cleaning CRM's agent provider pages.
  const { data: lead } = await supabase.from("leadgen_leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

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
  ]);

  const bookingLink = client ? getEffectiveBookingLink(client as LeadgenClientRow, campaign as LeadgenCampaignRow | null) : null;

  return (
    <LeadDetailClient
      lead={lead as LeadgenLeadRow}
      client={client as LeadgenClientRow}
      campaign={campaign as LeadgenCampaignRow | null}
      agents={[]}
      assignedAgentName={agent.full_name}
      currentUserName={agent.full_name || agent.email}
      currentUserId={agent.id}
      activities={(activities ?? []) as LeadgenLeadActivityRow[]}
      followUps={(followUps ?? []) as LeadgenFollowUpRow[]}
      appointments={(appointments ?? []) as LeadgenAppointmentRow[]}
      emails={(emails ?? []) as LeadgenEmailRow[]}
      consultationTemplate={consultationTemplate as LeadgenEmailTemplateRow | null}
      consultationInvitationTemplate={consultationInvitationTemplate as LeadgenEmailTemplateRow | null}
      consultationFollowUpTemplate={consultationFollowUpTemplate as LeadgenEmailTemplateRow | null}
      bookingLink={bookingLink}
      isAdmin={false}
      actions={actions}
      listPath="/leadgen/agent/leads"
    />
  );
}
