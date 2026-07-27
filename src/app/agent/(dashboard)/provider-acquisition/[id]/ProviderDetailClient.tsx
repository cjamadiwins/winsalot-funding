"use client";

import SharedProviderDetailClient, {
  type ProviderDetailActions,
} from "@/components/provider-acquisition/ProviderDetailClient";
import type { LatestProviderLeadEmail, ProviderActivityRow, ProviderFollowUpRow, ProviderLeadRow } from "@/lib/provider-types";
import {
  addProviderActivityAction,
  addProviderCallNoteAction,
  closeProviderLeadAction,
  deleteProviderLeadAction,
  markApprovedProviderAction,
  markIntakeFormCompletedAction,
  markNotInterestedAction,
  sendProviderIntakeEmailAction,
  updateProviderDetailsAction,
  updateProviderStatusAction,
} from "../actions";
import {
  completeProviderFollowUpAction,
  rescheduleProviderFollowUpAction,
  scheduleProviderFollowUpAction,
} from "../../provider-followup-actions";

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
  deleteProviderLead: deleteProviderLeadAction,
  scheduleFollowUp: scheduleProviderFollowUpAction,
  rescheduleFollowUp: rescheduleProviderFollowUpAction,
  completeFollowUp: completeProviderFollowUpAction,
};

export default function ProviderDetailClient({
  provider,
  activities,
  followUps,
  latestEmail,
  justAdded,
}: {
  provider: ProviderLeadRow;
  activities: ProviderActivityRow[];
  followUps: ProviderFollowUpRow[];
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
      isAdmin={false}
      actions={actions}
      listPath="/agent/provider-acquisition"
    />
  );
}
