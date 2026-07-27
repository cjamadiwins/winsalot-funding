"use client";

import SharedProviderDetailClient, {
  type ProviderDetailActions,
} from "@/components/provider-acquisition/ProviderDetailClient";
import type {
  LatestProviderLeadEmail,
  ProviderActivityRow,
  ProviderFollowUpRow,
  ProviderLeadRow,
} from "@/lib/provider-types";
import type { CrmUserRow } from "@/lib/crm-types";
import {
  addProviderActivityAction,
  addProviderCallNoteAction,
  assignProviderAgentAction,
  closeProviderLeadAction,
  completeProviderFollowUpAction,
  deleteProviderLeadAction,
  markApprovedProviderAction,
  markIntakeFormCompletedAction,
  markNotInterestedAction,
  removeProviderFollowUpAction,
  reopenProviderLeadAction,
  rescheduleProviderFollowUpAction,
  scheduleProviderFollowUpAction,
  sendProviderIntakeEmailAction,
  updateProviderDetailsAction,
  updateProviderStatusAction,
} from "../actions";

const actions: ProviderDetailActions = {
  updateDetails: updateProviderDetailsAction,
  updateStatus: updateProviderStatusAction,
  addCallNote: addProviderCallNoteAction,
  addActivity: addProviderActivityAction,
  sendIntakeEmail: sendProviderIntakeEmailAction,
  markIntakeFormCompleted: markIntakeFormCompletedAction,
  markApprovedProvider: markApprovedProviderAction,
  markNotInterested: markNotInterestedAction,
  closeProviderLead: closeProviderLeadAction,
  reopenProviderLead: reopenProviderLeadAction,
  deleteProviderLead: deleteProviderLeadAction,
  assignAgent: assignProviderAgentAction,
  scheduleFollowUp: scheduleProviderFollowUpAction,
  rescheduleFollowUp: rescheduleProviderFollowUpAction,
  completeFollowUp: completeProviderFollowUpAction,
  removeFollowUp: removeProviderFollowUpAction,
};

export default function AdminProviderDetailClient({
  provider,
  activities,
  followUps,
  agents,
  latestEmail,
  justAdded,
}: {
  provider: ProviderLeadRow;
  activities: ProviderActivityRow[];
  followUps: ProviderFollowUpRow[];
  agents: CrmUserRow[];
  latestEmail: LatestProviderLeadEmail | null;
  justAdded: boolean;
}) {
  return (
    <SharedProviderDetailClient
      provider={provider}
      activities={activities}
      followUps={followUps}
      latestEmail={latestEmail}
      justAdded={justAdded}
      isAdmin
      agents={agents}
      actions={actions}
      listPath="/admin/crm/provider-acquisition"
    />
  );
}
