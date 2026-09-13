import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { loadLeadgenAgentLeadDetail } from "@/lib/leadgen-agent-lead-detail-data";
import LeadDetailClient, { type LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import { bookAppointmentAction } from "../../appointments/actions";
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
  // No resendEmail / assignAgent - agents can't resend a failed prospect
  // email (admin-only per the brief) or reassign a lead. Likewise no
  // resendAppointmentNotification / sendAppointmentReminder - those manual
  // sends are admin-only (see LeadDetailActions above).
};

export default async function LeadgenAgentLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireLeadgenAgent();
  const { id } = await params;

  const detail = await loadLeadgenAgentLeadDetail(id);

  if (!detail) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-8 text-center">
        <h1 className="text-lg font-bold text-slate-900">Business record not found</h1>
        <p className="mt-2 text-sm text-slate-500">This lead may have been deleted, reassigned, or the link may be incorrect.</p>
        <Link
          href="/leadgen/agent/leads"
          className="mt-5 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          ← Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <LeadDetailClient
      lead={detail.lead}
      client={detail.client!}
      campaign={detail.campaign}
      agents={[]}
      assignedAgentName={agent.full_name}
      currentUserName={agent.full_name || agent.email}
      currentUserId={agent.id}
      activities={detail.activities}
      followUps={detail.followUps}
      appointments={detail.appointments}
      automaticReminderStatusByAppointmentId={detail.automaticReminderStatusByAppointmentId}
      smsReminderStatusByAppointmentId={detail.smsReminderStatusByAppointmentId}
      emails={detail.emails}
      consultationTemplate={detail.consultationTemplate}
      consultationInvitationTemplate={detail.consultationInvitationTemplate}
      consultationFollowUpTemplate={detail.consultationFollowUpTemplate}
      mantraCollabTemplate={detail.mantraCollabTemplate}
      followUpTemplates={detail.followUpTemplates}
      bookingLink={detail.bookingLink}
      servicesInfoLink={detail.servicesInfoLink}
      bouncedEmails={detail.bouncedEmails}
      isAdmin={false}
      actions={actions}
      listPath="/leadgen/agent/leads"
      dncSuppression={detail.dncSuppression}
    />
  );
}
