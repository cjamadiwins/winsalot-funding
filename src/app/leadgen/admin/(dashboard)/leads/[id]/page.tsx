import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import LeadDetailClient, { type LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import { assignLeadAction } from "../actions";
import { resendLeadgenEmailAction } from "../../actions";
import { bookAppointmentAction } from "../../appointments/actions";
import { completeFollowUpAction, recordCallOutcomeAction, scheduleFollowUpAction, sendConsultationEmailAction, updateLeadAction } from "./actions";

const actions: LeadDetailActions = {
  updateLead: updateLeadAction,
  recordCallOutcome: recordCallOutcomeAction,
  scheduleFollowUp: scheduleFollowUpAction,
  completeFollowUp: completeFollowUpAction,
  bookAppointment: bookAppointmentAction,
  sendConsultationEmail: sendConsultationEmailAction,
  resendEmail: resendLeadgenEmailAction,
  assignAgent: assignLeadAction,
};

export default async function LeadgenAdminLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requireLeadgenAdmin();
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: lead } = await admin.from("leadgen_leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [
    { data: client },
    { data: campaign },
    { data: agents },
    { data: activities },
    { data: followUps },
    { data: appointments },
    { data: emails },
    { data: consultationTemplate },
  ] = await Promise.all([
    admin.from("leadgen_clients").select("*").eq("id", lead.client_id).maybeSingle(),
    lead.campaign_id
      ? admin.from("leadgen_campaigns").select("*").eq("id", lead.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("leadgen_users").select("*").eq("role", "agent").order("full_name"),
    admin.from("leadgen_lead_activities").select("*").eq("lead_id", id).order("occurred_at", { ascending: false }),
    admin.from("leadgen_followups").select("*").eq("lead_id", id).order("scheduled_at", { ascending: true }),
    admin.from("leadgen_appointments").select("*").eq("lead_id", id).order("appointment_date", { ascending: false }),
    admin.from("leadgen_emails").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    admin.from("leadgen_email_templates").select("*").eq("key", "consultation_information").maybeSingle(),
  ]);

  const assignedAgent = lead.assigned_agent_id ? (agents ?? []).find((a) => a.id === lead.assigned_agent_id) : null;
  const bookingLink = client ? getEffectiveBookingLink(client as LeadgenClientRow, campaign as LeadgenCampaignRow | null) : null;

  return (
    <LeadDetailClient
      lead={lead as LeadgenLeadRow}
      client={client as LeadgenClientRow}
      campaign={campaign as LeadgenCampaignRow | null}
      agents={(agents ?? []) as LeadgenUserRow[]}
      assignedAgentName={assignedAgent?.full_name ?? null}
      currentUserName={adminUser.full_name || adminUser.email}
      currentUserId={adminUser.id}
      activities={(activities ?? []) as LeadgenLeadActivityRow[]}
      followUps={(followUps ?? []) as LeadgenFollowUpRow[]}
      appointments={(appointments ?? []) as LeadgenAppointmentRow[]}
      emails={(emails ?? []) as LeadgenEmailRow[]}
      consultationTemplate={consultationTemplate as LeadgenEmailTemplateRow | null}
      bookingLink={bookingLink}
      isAdmin
      actions={actions}
      listPath="/leadgen/admin/leads"
    />
  );
}
