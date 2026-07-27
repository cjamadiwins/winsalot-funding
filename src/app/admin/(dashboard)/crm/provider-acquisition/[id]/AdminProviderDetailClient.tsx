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
import type { CrmUserRow } from "@/lib/crm-types";
import {
  addProviderActivityAction,
  addProviderCallNoteAction,
  addProviderNoteAction,
  approveProviderAndAddToDirectoryAction,
  assignProviderAgentAction,
  closeProviderLeadAction,
  completeProviderFollowUpAction,
  deleteProviderLeadAction,
  markDeclinedAction,
  markIntakeFormCompletedAction,
  markNotInterestedAction,
  removeProviderDocumentAction,
  removeProviderFollowUpAction,
  reopenProviderLeadAction,
  rescheduleProviderFollowUpAction,
  scheduleProviderFollowUpAction,
  sendProviderEmailAction,
  sendProviderIntakeEmailAction,
  sendProviderSmsAction,
  updateProviderNoteAction,
  updateProviderProfileAction,
  updateProviderStatusAction,
  uploadProviderDocumentAction,
} from "../actions";

const actions: ProviderDetailActions = {
  updateProfile: updateProviderProfileAction,
  updateStatus: updateProviderStatusAction,
  addCallNote: addProviderCallNoteAction,
  addActivity: addProviderActivityAction,
  sendIntakeEmail: sendProviderIntakeEmailAction,
  sendEmail: sendProviderEmailAction,
  sendSms: sendProviderSmsAction,
  markIntakeFormCompleted: markIntakeFormCompletedAction,
  approveAndAddToDirectory: approveProviderAndAddToDirectoryAction,
  markNotInterested: markNotInterestedAction,
  markDeclined: markDeclinedAction,
  closeProviderLead: closeProviderLeadAction,
  reopenProviderLead: reopenProviderLeadAction,
  deleteProviderLead: deleteProviderLeadAction,
  assignAgent: assignProviderAgentAction,
  scheduleFollowUp: scheduleProviderFollowUpAction,
  rescheduleFollowUp: rescheduleProviderFollowUpAction,
  completeFollowUp: completeProviderFollowUpAction,
  removeFollowUp: removeProviderFollowUpAction,
  addNote: addProviderNoteAction,
  updateNote: updateProviderNoteAction,
  uploadDocument: uploadProviderDocumentAction,
  removeDocument: removeProviderDocumentAction,
};

export default function AdminProviderDetailClient({
  provider,
  activities,
  followUps,
  agents,
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
  agents: CrmUserRow[];
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
      isAdmin
      currentUserId={currentUserId}
      agents={agents}
      actions={actions}
      listPath="/admin/crm/provider-acquisition"
    />
  );
}
