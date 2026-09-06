"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  effectiveOpportunityCategory,
  OPPORTUNITY_AGENT_STATUS_LABELS,
  OPPORTUNITY_AGENT_STATUSES,
  OPPORTUNITY_CATEGORY_LABELS,
  OPPORTUNITY_CATEGORY_STYLES,
  type CrmOpportunityScoreRow,
} from "@/lib/opportunity-finder";
import { OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_STYLES, type OpportunityStage } from "@/lib/crm-types";
import type { OpportunityBoardCard } from "@/lib/opportunity-board";
import OpportunityBoardView from "@/components/crm-ui/OpportunityBoardView";
import { setMyOpportunityStatusAction } from "./actions";

const APPOINTMENT_STATUS_STYLES: Record<string, string> = {
  booked: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};

export type MyOpportunityRow = {
  score: CrmOpportunityScoreRow;
  businessName: string;
  contactName: string | null;
  phone: string;
  email: string | null;
  stageOrStatus: string;
  assignedAgentName: string;
  nextFollowUpAt: string | null;
  lastCallAt: string | null;
  lastEmailAt: string | null;
  lastNote: string | null;
  notes: string[];
  lastCallOutcome: string | null;
  appointmentStatus: string | null;
  detailHref: string;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MyOpportunitiesClient({
  rows,
  initialView,
  onAddNote,
}: {
  rows: MyOpportunityRow[];
  initialView?: "list" | "board";
  onAddNote: (opportunityId: string, note: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [view, setView] = useState<"list" | "board">(initialView ?? "list");

  const visible = useMemo(
    () => rows.filter((row) => showClosed || (effectiveOpportunityCategory(row.score) !== "closed" && row.score.agent_status !== "closed")),
    [rows, showClosed]
  );

  const boardColumns = OPPORTUNITY_STAGES.map((stage) => ({ key: stage, label: stage, styleClass: OPPORTUNITY_STAGE_STYLES[stage] }));
  const boardCards: OpportunityBoardCard[] = useMemo(
    () =>
      visible.map((row) => ({
        id: row.score.opportunity_id,
        businessName: row.businessName,
        clientOrBusiness: row.businessName,
        assignedAgentName: row.assignedAgentName,
        phone: row.phone,
        score: row.score.score,
        scoreCategoryLabel: OPPORTUNITY_CATEGORY_LABELS[effectiveOpportunityCategory(row.score)],
        scoreCategoryStyle: OPPORTUNITY_CATEGORY_STYLES[effectiveOpportunityCategory(row.score)],
        stageKey: row.stageOrStatus,
        stageLabel: row.stageOrStatus,
        stageStyle: OPPORTUNITY_STAGE_STYLES[row.stageOrStatus as OpportunityStage] ?? "bg-slate-100 text-slate-700",
        lastCallAt: row.lastCallAt,
        lastCallOutcome: row.lastCallOutcome,
        notes: row.notes,
        nextFollowUpAt: row.nextFollowUpAt,
        appointmentStatus: row.appointmentStatus,
        appointmentStatusStyle: row.appointmentStatus ? APPOINTMENT_STATUS_STYLES[row.appointmentStatus] ?? "bg-slate-100 text-slate-700" : null,
        viewHref: row.detailHref,
        editHref: row.detailHref,
      })),
    [visible]
  );

  function updateStatus(scoreId: string, status: (typeof OPPORTUNITY_AGENT_STATUSES)[number]) {
    setError(null);
    startTransition(async () => {
      const result = await setMyOpportunityStatusAction(scoreId, status);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-6">
      {error && <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed / not-opportunity leads too
        </label>
        <div className="flex rounded-full border border-slate-300 p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${view === "list" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            List View
          </button>
          <button
            type="button"
            onClick={() => setView("board")}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${view === "board" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            Board View
          </button>
        </div>
      </div>

      {view === "board" && (
        <OpportunityBoardView
          columns={boardColumns}
          cards={boardCards}
          onAddNote={onAddNote}
          scopeNotice="Showing only opportunities assigned to you."
        />
      )}

      {view === "list" && (
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((row) => {
          const effective = effectiveOpportunityCategory(row.score);
          return (
            <div key={row.score.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900">{row.businessName}</div>
                  <div className="text-[13px] text-slate-500">{row.contactName || "No contact name"}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xl font-extrabold text-slate-900">{row.score.score}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${OPPORTUNITY_CATEGORY_STYLES[effective]}`}>
                    {OPPORTUNITY_CATEGORY_LABELS[effective]}
                  </span>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px] text-slate-600">
                <div>
                  <dt className="text-slate-400">Last call</dt>
                  <dd>{fmt(row.lastCallAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Last email</dt>
                  <dd>{fmt(row.lastEmailAt)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-400">Follow-up</dt>
                  <dd>{fmt(row.nextFollowUpAt)}</dd>
                </div>
              </dl>

              <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[12.5px] text-slate-600">
                {row.score.reasons.slice(0, 3).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] font-semibold text-slate-800">{row.score.recommended_action}</div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <a href={`tel:${row.phone}`} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-slate-400">
                  Call
                </a>
                {row.email && (
                  <a href={`mailto:${row.email}`} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-slate-400">
                    Email
                  </a>
                )}
                <Link href={row.detailHref} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-slate-400">
                  Add Follow-Up
                </Link>
                <Link href={row.detailHref} className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11.5px] font-semibold text-indigo-700 hover:border-indigo-400">
                  View Lead
                </Link>
              </div>

              <select
                value={row.score.agent_status}
                disabled={isPending}
                onChange={(e) => updateStatus(row.score.id, e.target.value as (typeof OPPORTUNITY_AGENT_STATUSES)[number])}
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900"
              >
                {OPPORTUNITY_AGENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    Mark as: {OPPORTUNITY_AGENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        {visible.length === 0 && <div className="col-span-full py-10 text-center text-slate-400">No opportunities to show right now.</div>}
      </div>
      )}
    </div>
  );
}
