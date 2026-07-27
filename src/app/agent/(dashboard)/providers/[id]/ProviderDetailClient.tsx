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
import {
  addOperationalActivityAction,
  addOperationalNoteAction,
  completeOperationalFollowUpAction,
  rescheduleOperationalFollowUpAction,
  scheduleOperationalFollowUpAction,
  sendOperationalEmailAction,
  sendOperationalSmsAction,
  updateOperationalNoteAction,
  updateOperationalProfileAction,
  uploadOperationalDocumentAction,
} from "../actions";

const actions: OperationalProviderDetailActions = {
  updateProfile: updateOperationalProfileAction,
  addActivity: addOperationalActivityAction,
  sendEmail: sendOperationalEmailAction,
  sendSms: sendOperationalSmsAction,
  scheduleFollowUp: scheduleOperationalFollowUpAction,
  rescheduleFollowUp: rescheduleOperationalFollowUpAction,
  completeFollowUp: completeOperationalFollowUpAction,
  addNote: addOperationalNoteAction,
  updateNote: updateOperationalNoteAction,
  uploadDocument: uploadOperationalDocumentAction,
};

export default function ProviderDetailClient({
  provider,
  activities,
  followUps,
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
      isAdmin={false}
      currentUserId={currentUserId}
      actions={actions}
      listPath="/agent/providers"
    />
  );
}
