"use client";

import { useState, useTransition } from "react";
import { PhoneCall, Sparkles } from "lucide-react";
import LargeModal from "@/components/crm-ui/LargeModal";
import type { AdminOpportunityDetailData } from "@/lib/admin-opportunity-detail-data";
import OpportunityFinderClient, { type OpportunityFinderRow } from "./OpportunityFinderClient";
import AdminOpportunityDetailClient from "../opportunities/[id]/AdminOpportunityDetailClient";
import { getOpportunityDetailForModalAction } from "./actions";

type ActionResult = { error?: string };

// Dashboard entry point into the Opportunity Finder: opens the exact same
// scoring, filters, List/Board views, and actions the standalone
// /admin/crm/opportunity-finder page renders (OpportunityFinderClient,
// unchanged logic) inside a large centered modal instead of navigating
// away from the dashboard. Clicking a business name or "View Opportunity"
// swaps the modal to that opportunity's full detail
// (AdminOpportunityDetailClient - the same component/actions the
// standalone /admin/crm/opportunities/[id] page uses) fetched on demand
// via getOpportunityDetailForModalAction, with a "Back to Opportunities"
// button returning to the list. The standalone page stays untouched as a
// fallback (e.g. for direct links/bookmarks).
export default function OpportunityFinderModalTrigger({
  rows,
  agents,
  clients,
  industries,
  onAddNote,
  onScheduleCallback,
  onCompleteFollowUp,
  hotCount,
}: {
  rows: OpportunityFinderRow[];
  agents: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  industries: string[];
  onAddNote: (opportunityId: string, note: string) => Promise<ActionResult>;
  onScheduleCallback: (opportunityId: string, formData: FormData) => Promise<void>;
  onCompleteFollowUp: (followUpId: string, opportunityId: string) => Promise<void>;
  hotCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOpportunityDetailData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }

  function viewDetail(opportunityId: string) {
    setSelectedId(opportunityId);
    setDetail(null);
    setDetailError(null);
    startTransition(async () => {
      const result = await getOpportunityDetailForModalAction(opportunityId);
      if ("error" in result) setDetailError(result.error);
      else setDetail(result);
    });
  }

  function backToList() {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-indigo-600 p-2.5 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[16px] font-bold text-slate-900">Opportunity Finder</div>
            <div className="mt-0.5 text-[12.5px] text-slate-600">Every opportunity ranked 0-100, without leaving your dashboard.</div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-[12px] font-bold text-red-800">
          <PhoneCall className="h-3.5 w-3.5" /> {hotCount} Hot
        </span>
      </button>

      <LargeModal
        open={open}
        onClose={close}
        title={selectedId ? undefined : "Opportunity Finder"}
        subtitle={selectedId ? undefined : "Every opportunity already in the CRM, scored 0-100 from real calls, emails, notes, follow-ups, and appointments on file."}
        headerLeft={
          selectedId ? (
            <button type="button" onClick={backToList} className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
              ← Back to Opportunities
            </button>
          ) : undefined
        }
        footer={
          <>
            <span className="text-[12px] text-slate-500">{rows.length} scored opportunit{rows.length === 1 ? "y" : "ies"}</span>
            <button type="button" onClick={close} className="rounded-lg bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white">
              Close
            </button>
          </>
        }
      >
        {selectedId ? (
          detailError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{detailError}</p>
          ) : isPending || !detail ? (
            <p className="py-10 text-center text-sm text-slate-400">Loading opportunity…</p>
          ) : (
            <AdminOpportunityDetailClient {...detail} onBack={backToList} />
          )
        ) : (
          <OpportunityFinderClient
            rows={rows}
            agents={agents}
            clients={clients}
            industries={industries}
            onAddNote={onAddNote}
            onScheduleCallback={onScheduleCallback}
            onCompleteFollowUp={onCompleteFollowUp}
            onViewDetail={viewDetail}
          />
        )}
      </LargeModal>
    </>
  );
}
