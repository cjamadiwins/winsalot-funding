"use client";

import SharedProviderDetailClient, {
  type ProviderDetailActions,
} from "@/components/provider-acquisition/ProviderDetailClient";
import type {
  LatestProviderLeadEmail,
  ProviderActivityRow,
  ProviderEmailHistoryRow,
  ProviderFollowUpRow,
  ProviderIntakeVersionRow,
  ProviderLeadRow,
  ProviderNoteRow,
} from "@/lib/provider-types";
import type { ProviderDocumentWithUrl } from "@/components/provider-acquisition/ProviderFilesCard";
import {
  addProviderActivityAction,
  addProviderCallNoteAction,
  addProviderNoteAction,
  closeProviderLeadAction,
  deleteProviderLeadAction,
  flagProviderForAdminReviewAction,
  markIntakeFormCompletedAction,
  markNotInterestedAction,
  sendProviderEmailAction,
  sendProviderIntakeEmailAction,
  sendProviderSmsAction,
  updateProviderNoteAction,
  updateProviderProfileAction,
  updateProviderStatusAction,
  uploadProviderDocumentAction,
} from "../actions";
import {
  completeProviderFollowUpAction,
  rescheduleProviderFollowUpAction,
  scheduleProviderFollowUpAction,
} from "../../provider-followup-actions";

const actions: ProviderDetailActions = {
  updateProfile: updateProviderProfileAction,
  updateStatus: updateProviderStatusAction,
  addCallNote: addProviderCallNoteAction,
  addActivity: addProviderActivityAction,
  sendIntakeEmail: sendProviderIntakeEmailAction,
  sendEmail: sendProviderEmailAction,
  sendSms: sendProviderSmsAction,
  markIntakeFormCompleted: markIntakeFormCompletedAction,
  markNotInterested: markNotInterestedAction,
  flagForReview: flagProviderForAdminReviewAction,
  closeProviderLead: closeProviderLeadAction,
  deleteProviderLead: deleteProviderLeadAction,
  scheduleFollowUp: scheduleProviderFollowUpAction,
  rescheduleFollowUp: rescheduleProviderFollowUpAction,
  completeFollowUp: completeProviderFollowUpAction,
  addNote: addProviderNoteAction,
  updateNote: updateProviderNoteAction,
  uploadDocument: uploadProviderDocumentAction,
};

export default function ProviderDetailClient({
  provider,
  activities,
  followUps,
  latestEmail,
  emailHistory,
  notes,
  documents,
  intakeVersions,
  logoUrl,
  currentUserId,
  justAdded,
}: {
  provider: ProviderLeadRow;
  activities: ProviderActivityRow[];
  followUps: ProviderFollowUpRow[];
  latestEmail: LatestProviderLeadEmail | null;
  emailHistory: ProviderEmailHistoryRow[];
  notes: ProviderNoteRow[];
  documents: ProviderDocumentWithUrl[];
  intakeVersions: ProviderIntakeVersionRow[];
  logoUrl: string | null;
  currentUserId: string;
  justAdded: boolean;
}) {
  return (
    <SharedProviderDetailClient
      provider={provider}
      activities={activities}
      followUps={followUps}
      latestEmail={latestEmail}
      emailHistory={emailHistory}
      notes={notes}
      documents={documents}
      intakeVersions={intakeVersions}
      logoUrl={logoUrl}
      justAdded={justAdded}
      isAdmin={false}
      currentUserId={currentUserId}
      actions={actions}
      listPath="/agent/provider-acquisition"
    />
  );
}
