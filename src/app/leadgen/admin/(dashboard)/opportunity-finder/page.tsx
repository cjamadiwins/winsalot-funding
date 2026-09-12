import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { loadLeadgenAdminOpportunityFinderData } from "@/lib/leadgen-admin-opportunity-finder-data";
import LeadgenOpportunityFinderClient from "./LeadgenOpportunityFinderClient";
import { addBoardLeadNoteAction } from "./actions";
import { completeFollowUpAction, scheduleFollowUpAction } from "../leads/[id]/actions";

export default async function LeadgenAdminOpportunityFinderPage({
  searchParams,
}: {
  // view=board is set by the dashboard's Opportunity Pipeline summary
  // card's "View Board" button.
  searchParams: Promise<{ category?: string; agent?: string; client?: string; followup?: string; industry?: string; view?: string }>;
}) {
  await requireLeadgenAdmin();
  const { category, agent, client, followup, industry, view } = await searchParams;
  const { rows, agents, clients, campaigns, industries } = await loadLeadgenAdminOpportunityFinderData();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Opportunity Finder</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every lead already in the CRM, scored 0-100 from real calls, emails, notes, follow-ups, and appointments on file.
          </p>
        </div>
        <Link href="/leadgen/admin" className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400">
          ← Back to Dashboard
        </Link>
      </div>

      <LeadgenOpportunityFinderClient
        rows={rows}
        agents={agents}
        clients={clients}
        campaigns={campaigns}
        industries={industries}
        initialCategory={category}
        initialAgentFilter={agent}
        initialClientFilter={client}
        initialFollowUpFilter={followup}
        initialIndustryFilter={industry}
        initialView={view === "board" ? "board" : "list"}
        onAddNote={addBoardLeadNoteAction}
        onScheduleCallback={scheduleFollowUpAction}
        onCompleteFollowUp={completeFollowUpAction}
      />
    </div>
  );
}
