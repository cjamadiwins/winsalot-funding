"use client";

import { useState, useTransition } from "react";
import { PhoneCall, Sparkles } from "lucide-react";
import LargeModal from "@/components/crm-ui/LargeModal";
import { OPPORTUNITY_CATEGORY_LABELS, OPPORTUNITY_CATEGORY_STYLES, effectiveOpportunityCategory } from "@/lib/opportunity-finder";
import type { AgentOpportunityDetailData } from "@/lib/agent-opportunity-detail-data";
import MyOpportunitiesClient, { type MyOpportunityRow } from "./MyOpportunitiesClient";
import OpportunityDetailClient from "../opportunities/[id]/OpportunityDetailClient";
import { getAgentOpportunityDetailForModalAction } from "../opportunities/[id]/actions";

type ActionResult = { error?: string };

// Agent dashboard entry point into "My Opportunities" (this CRM's
// Opportunity Finder for an agent - the standalone page is still
// available as a fallback). Opens the exact same scored list
// (MyOpportunitiesClient, unchanged logic - RLS already restricts every
// row to this agent) in a large centered modal; "View Opportunity" swaps
// the modal to that opportunity's full detail (OpportunityDetailClient,
// same component/actions the standalone /agent/opportunities/[id] page
// uses) fetched on demand, with a score explanation panel above it since
// the standalone page has never shown that.
export default function OpportunityFinderModalTrigger({
  rows,
  currentAgentId,
  onAddNote,
  onScheduleCallback,
  onCompleteFollowUp,
  hotCount,
}: {
  rows: MyOpportunityRow[];
  currentAgentId: string;
  onAddNote: (opportunityId: string, note: string) => Promise<ActionResult>;
  onScheduleCallback: (opportunityId: string, formData: FormData) => Promise<void>;
  onCompleteFollowUp: (followUpId: string, opportunityId: string) => Promise<void>;
  hotCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentOpportunityDetailData | null>(null);
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
      const result = await getAgentOpportunityDetailForModalAction(opportunityId);
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
            <div className="mt-0.5 text-[12.5px] text-slate-600">Your own opportunities ranked 0-100, without leaving your dashboard.</div>
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
        subtitle={selectedId ? undefined : "Your own opportunities ranked 0-100, with why the CRM flagged each one and what to do next."}
        headerLeft={
          selectedId ? (
            <button type="button" onClick={backToList} className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
              ← Back to My Opportunities
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
            <>
              {detail.score && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold text-slate-900">{detail.score.score}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${OPPORTUNITY_CATEGORY_STYLES[effectiveOpportunityCategory(detail.score)]}`}>
                      {OPPORTUNITY_CATEGORY_LABELS[effectiveOpportunityCategory(detail.score)]}
                    </span>
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12.5px] text-slate-600">
                    {detail.score.reasons.slice(0, 3).map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  <div className="mt-2 text-[12.5px] font-semibold text-slate-800">{detail.score.recommended_action}</div>
                </div>
              )}
              <OpportunityDetailClient
                opportunity={detail.opportunity}
                activities={detail.activities}
                followUps={detail.followUps}
                currentAgentId={currentAgentId}
                emailHistory={detail.emailHistory}
                isEmailSuppressed={detail.isEmailSuppressed}
                bookingUrl={detail.bookingUrl}
                onBack={backToList}
              />
            </>
          )
        ) : (
          <MyOpportunitiesClient
            rows={rows}
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
