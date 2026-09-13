import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { loadLeadgenLeadDetail } from "@/lib/leadgen-lead-detail-data";
import LeadDetailClient, { type LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import { assignLeadAction, deleteLeadgenLeadAction } from "../actions";
import { clearBouncedEmailAction, resendLeadgenEmailAction } from "../../actions";
import { bookAppointmentAction, resendAppointmentNotificationAction, sendAppointmentReminderAction } from "../../appointments/actions";
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

  const detail = await loadLeadgenLeadDetail(id);

  if (!detail) {
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

  return (
    <LeadDetailClient
      lead={detail.lead}
      client={detail.client!}
      campaign={detail.campaign}
      agents={detail.agents}
      assignedAgentName={detail.assignedAgentName}
      currentUserName={adminUser.full_name || adminUser.email}
      currentUserId={adminUser.id}
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
      isAdmin
      actions={actions}
      listPath="/leadgen/admin/leads"
      score={detail.score}
      dncSuppression={detail.dncSuppression}
    />
  );
}
