"use client";

import OperationalProviderDetailClient, {
  type OperationalProviderDetailActions,
} from "@/components/providers/OperationalProviderDetailClient";
import type {
  CleaningProviderRow,
  LatestProviderLeadEmail,
  ProviderActivityRow,
  ProviderEmailHistoryRow,
  ProviderFollowUpRow,
  ProviderNoteRow,
  ProviderScoreAdjustmentRow,
} from "@/lib/provider-types";
import type { ProviderDocumentWithUrl } from "@/components/provider-acquisition/ProviderFilesCard";
import type { ProviderQuoteHistoryRow } from "@/lib/provider-quote-history";
import type { CrmUserRow } from "@/lib/crm-types";
import {
  addOperationalActivityAction,
  addOperationalNoteAction,
  addOperationalScoreAdjustmentAction,
  assignOperationalAgentAction,
  completeOperationalFollowUpAction,
  deleteOperationalProviderAction,
  recalculateOperationalScoreAction,
  removeOperationalDocumentAction,
  removeOperationalFollowUpAction,
  rescheduleOperationalFollowUpAction,
  scheduleOperationalFollowUpAction,
  sendOperationalEmailAction,
  sendOperationalSmsAction,
  updateOperationalNoteAction,
  updateOperationalProfileAction,
  updateOperationalStatusAction,
  uploadOperationalDocumentAction,
} from "../actions";

const actions: OperationalProviderDetailActions = {
  updateProfile: updateOperationalProfileAction,
  updateStatus: updateOperationalStatusAction,
  addActivity: addOperationalActivityAction,
  sendEmail: sendOperationalEmailAction,
  sendSms: sendOperationalSmsAction,
  assignAgent: assignOperationalAgentAction,
  scheduleFollowUp: scheduleOperationalFollowUpAction,
  rescheduleFollowUp: rescheduleOperationalFollowUpAction,
  completeFollowUp: completeOperationalFollowUpAction,
  removeFollowUp: removeOperationalFollowUpAction,
  addNote: addOperationalNoteAction,
  updateNote: updateOperationalNoteAction,
  uploadDocument: uploadOperationalDocumentAction,
  removeDocument: removeOperationalDocumentAction,
  addScoreAdjustment: addOperationalScoreAdjustmentAction,
  recalculateScore: recalculateOperationalScoreAction,
  deleteProvider: deleteOperationalProviderAction,
};

export default function AdminOperationalProviderDetailClient({
  provider,
  activities,
  followUps,
  agents,
  notes,
  documents,
  scoreAdjustments,
  emailHistory,
  latestEmail,
  quoteHistory,
  logoUrl,
  linkedLead,
  currentUserId,
}: {
  provider: CleaningProviderRow;
  activities: ProviderActivityRow[];
  followUps: ProviderFollowUpRow[];
  agents: CrmUserRow[];
  notes: ProviderNoteRow[];
  documents: ProviderDocumentWithUrl[];
  scoreAdjustments: ProviderScoreAdjustmentRow[];
  emailHistory: ProviderEmailHistoryRow[];
  latestEmail: LatestProviderLeadEmail | null;
  quoteHistory: ProviderQuoteHistoryRow[];
  logoUrl: string | null;
  linkedLead: { id: string; business_name: string } | null;
  currentUserId: string;
}) {
  return (
    <OperationalProviderDetailClient
      provider={provider}
      activities={activities}
      followUps={followUps}
      notes={notes}
      documents={documents}
      scoreAdjustments={scoreAdjustments}
      emailHistory={emailHistory}
      latestEmail={latestEmail}
      quoteHistory={quoteHistory}
      logoUrl={logoUrl}
      linkedLead={linkedLead}
      isAdmin
      currentUserId={currentUserId}
      agents={agents}
      actions={actions}
      listPath="/admin/providers"
    />
  );
}
