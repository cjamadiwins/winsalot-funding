import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadLeadgenAgentMyOpportunities } from "@/lib/leadgen-agent-my-opportunities-data";
import LeadgenMyOpportunitiesClient from "./LeadgenMyOpportunitiesClient";
import { addBoardLeadNoteAction } from "./actions";
import { completeFollowUpAction, scheduleFollowUpAction } from "../leads/[id]/actions";

export default async function LeadgenAgentMyOpportunitiesPage({
  searchParams,
}: {
  // view=board is set by the agent dashboard's Opportunity Pipeline
  // summary card's "View Board" button; category is set by the agent
  // dashboard's own Opportunity Finder summary card (Hot/Warm/Follow-Up/
  // Retry).
  searchParams: Promise<{ view?: string; category?: string }>;
}) {
  const { view, category } = await searchParams;
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const rows = await loadLeadgenAgentMyOpportunities(supabase, agent.full_name || agent.email);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Opportunities</h1>
        <p className="mt-1 text-sm text-slate-500">
          {agent.full_name || agent.email}, here are your leads ranked by score, with why the CRM flagged each one and what to do next.
        </p>
      </div>
      <LeadgenMyOpportunitiesClient
        rows={rows}
        initialView={view === "board" ? "board" : "list"}
        initialCategory={category}
        onAddNote={addBoardLeadNoteAction}
        onScheduleCallback={scheduleFollowUpAction}
        onCompleteFollowUp={completeFollowUpAction}
      />
    </div>
  );
}
