import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { loadAdminOpportunityFinderData } from "@/lib/admin-opportunity-finder-data";
import OpportunityFinderClient from "./OpportunityFinderClient";
import { addBoardOpportunityNoteAction } from "./actions";
import { completeFollowUpAction, scheduleFollowUpAction } from "../followup-actions";

export default async function AdminOpportunityFinderPage({
  searchParams,
}: {
  // Set by the CRM dashboard's clickable KPI cards (see /admin/crm/page.tsx)
  // to land here pre-filtered - view=board is set by the dashboard's
  // Opportunity Pipeline summary card's "View Board" button.
  searchParams: Promise<{ category?: string; agent?: string; client?: string; followup?: string; industry?: string; view?: string }>;
}) {
  await requireCrmAdmin();
  const { category, agent, client, followup, industry, view } = await searchParams;
  const { rows, agents, clients, industries } = await loadAdminOpportunityFinderData();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Opportunity Finder</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every opportunity already in the CRM, scored 0-100 from real calls, emails, notes, follow-ups, and appointments on file.
          </p>
        </div>
        <Link href="/admin/crm" className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400">
          ← Back to Dashboard
        </Link>
      </div>

      <OpportunityFinderClient
        rows={rows}
        agents={agents}
        clients={clients}
        industries={industries}
        initialCategory={category}
        initialAgentFilter={agent}
        initialClientFilter={client}
        initialFollowUpFilter={followup}
        initialIndustryFilter={industry}
        initialView={view === "board" ? "board" : "list"}
        onAddNote={addBoardOpportunityNoteAction}
        onScheduleCallback={scheduleFollowUpAction}
        onCompleteFollowUp={completeFollowUpAction}
      />
    </div>
  );
}
