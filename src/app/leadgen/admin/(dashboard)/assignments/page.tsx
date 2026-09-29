import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { findAssignmentProblems, loadAssignmentOverview } from "@/lib/leadgen-campaign-assignment";
import AssignmentsClient from "./AssignmentsClient";
import { setCampaignAgentAction, setSegmentAgentAction, setSegmentCampaignAction } from "./actions";

export default async function LeadgenAdminAssignmentsPage() {
  await requireLeadgenAdmin();
  const overview = await loadAssignmentOverview({ withCounts: true });
  const problems = findAssignmentProblems(overview);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Client Assignments</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        The call list decides which client an agent is calling for. Assign each list to a client/campaign and to its agents here; agents are then
        switched to the right client automatically when they open that list. Changing a list&apos;s client only affects work done from now on -
        existing calls, appointments, emails and promoted leads keep the client they were recorded under.
      </p>
      <div className="mt-6">
        <AssignmentsClient
          overview={overview}
          problems={problems}
          setCampaignAgent={setCampaignAgentAction}
          setSegmentAgent={setSegmentAgentAction}
          setSegmentCampaign={setSegmentCampaignAction}
        />
      </div>
    </div>
  );
}
