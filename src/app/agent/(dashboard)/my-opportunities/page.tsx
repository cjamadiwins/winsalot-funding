import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadAgentMyOpportunities } from "@/lib/agent-my-opportunities-data";
import MyOpportunitiesClient from "./MyOpportunitiesClient";
import { addBoardOpportunityNoteAction } from "./actions";
import { completeOpportunityFollowUpAction, scheduleOpportunityFollowUpAction } from "../opportunities/[id]/actions";

export default async function AgentMyOpportunitiesPage({
  searchParams,
}: {
  // view=board is set by the agent dashboard's Opportunity Pipeline
  // summary card's "View Board" button; category is set by the agent
  // dashboard's own Opportunity Finder summary card (Hot/Warm/Follow-Up/
  // Retry).
  searchParams: Promise<{ view?: string; category?: string }>;
}) {
  const { view, category } = await searchParams;
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const rows = await loadAgentMyOpportunities(supabase, crmUser.full_name || crmUser.email);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Opportunities</h1>
        <p className="mt-1 text-sm text-slate-500">
          {crmUser.full_name || crmUser.email}, here are your opportunities ranked by score, with why the CRM flagged each one and what to do next.
        </p>
      </div>
      <MyOpportunitiesClient
        rows={rows}
        initialView={view === "board" ? "board" : "list"}
        initialCategory={category}
        onAddNote={addBoardOpportunityNoteAction}
        onScheduleCallback={scheduleOpportunityFollowUpAction}
        onCompleteFollowUp={completeOpportunityFollowUpAction}
      />
    </div>
  );
}
