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
  ProviderScoreAdjustmentRow,
} from "@/lib/provider-types";
import type { ProviderDocumentWithUrl } from "@/components/provider-acquisition/ProviderFilesCard";
import type { ProviderQuoteHistoryRow } from "@/lib/provider-quote-history";
import type { CrmUserRow } from "@/lib/crm-types";
import {
  addProviderActivityAction,
  addProviderCallNoteAction,
  addProviderNoteAction,
  addScoreAdjustmentAction,
  assignProviderAgentAction,
  closeProviderLeadAction,
  completeProviderFollowUpAction,
  deleteProviderLeadAction,
  linkCleaningProviderAction,
  markApprovedProviderAction,
  markDeclinedAction,
  markIntakeFormCompletedAction,
  markNotInterestedAction,
  markSuspendedAction,
  recalculateProviderScoreAction,
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
  markApprovedProvider: markApprovedProviderAction,
  markNotInterested: markNotInterestedAction,
  markSuspended: markSuspendedAction,
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
  addScoreAdjustment: addScoreAdjustmentAction,
  recalculateScore: recalculateProviderScoreAction,
  linkCleaningProvider: linkCleaningProviderAction,
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
  scoreAdjustments,
  intakeVersions,
  quoteHistory,
  cleaningProviders,
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
  scoreAdjustments: ProviderScoreAdjustmentRow[];
  intakeVersions: ProviderIntakeVersionRow[];
  quoteHistory: ProviderQuoteHistoryRow[];
  cleaningProviders: { id: string; company_name: string }[];
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
      scoreAdjustments={scoreAdjustments}
      intakeVersions={intakeVersions}
      quoteHistory={quoteHistory}
      cleaningProviders={cleaningProviders}
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
