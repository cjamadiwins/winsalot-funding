"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  effectiveOpportunityCategory,
  OPPORTUNITY_AGENT_STATUS_LABELS,
  OPPORTUNITY_AGENT_STATUSES,
  OPPORTUNITY_CATEGORIES,
  OPPORTUNITY_CATEGORY_DESCRIPTIONS,
  OPPORTUNITY_CATEGORY_LABELS,
  OPPORTUNITY_CATEGORY_STYLES,
  type LeadgenOpportunityScoreRow,
  type OpportunityCategory,
} from "@/lib/opportunity-finder";
import {
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_LEAD_STATUSES,
  LEADGEN_LEAD_STATUS_STYLES,
  type LeadgenAppointmentStatus,
  type LeadgenLeadStatus,
} from "@/lib/leadgen-types";
import type { OpportunityBoardCard } from "@/lib/opportunity-board";
import OpportunityBoardView from "@/components/crm-ui/OpportunityBoardView";
import RowsPerPagePager, { usePagedRows } from "@/components/crm-ui/RowsPerPagePager";
import { setMyLeadgenOpportunityStatusAction } from "./actions";

export type LeadgenMyOpportunityRow = {
  score: LeadgenOpportunityScoreRow;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  assignedAgentName: string;
  clientOrBusiness: string;
  nextFollowUpAt: string | null;
  lastCallAt: string | null;
  lastEmailAt: string | null;
  lastNote: string | null;
  notes: string[];
  lastCallOutcome: string | null;
  appointmentStatus: string | null;
  // The earliest pending callback for this lead, if any - what "Mark
  // Complete" completes.
  followUpId: string | null;
  detailHref: string;
};

type ActionResult = { error?: string };

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function LeadgenMyOpportunitiesClient({
  rows,
  initialView,
  initialCategory,
  onAddNote,
  onScheduleCallback,
  onCompleteFollowUp,
  onViewDetail,
}: {
  rows: LeadgenMyOpportunityRow[];
  initialView?: "list" | "board";
  initialCategory?: string;
  onAddNote: (leadId: string, note: string) => Promise<{ error?: string }>;
  onScheduleCallback: (leadId: string, formData: FormData) => Promise<ActionResult>;
  onCompleteFollowUp: (followUpId: string, leadId: string) => Promise<ActionResult>;
  // Set only when rendered inside the Opportunity Finder dashboard modal -
  // "View Lead" then switches the modal to its inline detail view instead
  // of navigating away. Omitted on the standalone
  // /leadgen/agent/my-opportunities page.
  onViewDetail?: (id: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [view, setView] = useState<"list" | "board">(initialView ?? "list");
  const [categoryFilter, setCategoryFilter] = useState<OpportunityCategory | "all">(
    initialCategory && OPPORTUNITY_CATEGORIES.includes(initialCategory as OpportunityCategory) ? (initialCategory as OpportunityCategory) : "all"
  );
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [callbackDraft, setCallbackDraft] = useState("");
  const [notingId, setNotingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  function runAction(fn: () => Promise<{ error?: string } | void>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && "error" in result && result.error) setError(result.error);
        else {
          onDone?.();
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const effective = effectiveOpportunityCategory(row.score);
        if (!showClosed && (effective === "closed" || row.score.agent_status === "closed")) return false;
        if (categoryFilter !== "all" && effective !== categoryFilter) return false;
        return true;
      }),
    [rows, showClosed, categoryFilter]
  );

  const { pageRows, page, pageCount, pageSize, setPage, setPageSize, totalCount, rangeStart, rangeEnd } = usePagedRows(visible);

  const boardColumns = LEADGEN_LEAD_STATUSES.map((status) => ({ key: status, label: status, styleClass: LEADGEN_LEAD_STATUS_STYLES[status] }));
  const boardCards: OpportunityBoardCard[] = useMemo(
    () =>
      visible.map((row) => ({
        id: row.score.lead_id,
        businessName: row.businessName,
        clientOrBusiness: row.clientOrBusiness,
        assignedAgentName: row.assignedAgentName,
        phone: row.phone,
        score: row.score.score,
        scoreCategoryLabel: OPPORTUNITY_CATEGORY_LABELS[effectiveOpportunityCategory(row.score)],
        scoreCategoryStyle: OPPORTUNITY_CATEGORY_STYLES[effectiveOpportunityCategory(row.score)],
        stageKey: row.status,
        stageLabel: row.status,
        stageStyle: LEADGEN_LEAD_STATUS_STYLES[row.status as LeadgenLeadStatus] ?? "bg-slate-100 text-slate-700",
        lastCallAt: row.lastCallAt,
        lastCallOutcome: row.lastCallOutcome,
        notes: row.notes,
        nextFollowUpAt: row.nextFollowUpAt,
        appointmentStatus: row.appointmentStatus,
        appointmentStatusStyle: row.appointmentStatus
          ? LEADGEN_APPOINTMENT_STATUS_STYLES[row.appointmentStatus as LeadgenAppointmentStatus] ?? "bg-slate-100 text-slate-700"
          : null,
        viewHref: row.detailHref,
        editHref: row.detailHref,
      })),
    [visible]
  );

  function updateStatus(scoreId: string, status: (typeof OPPORTUNITY_AGENT_STATUSES)[number]) {
    setError(null);
    startTransition(async () => {
      const result = await setMyLeadgenOpportunityStatusAction(scoreId, status);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-6">
      {error && <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...OPPORTUNITY_CATEGORIES.filter((c) => c !== "closed")] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            title={cat === "all" ? undefined : OPPORTUNITY_CATEGORY_DESCRIPTIONS[cat]}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
              categoryFilter === cat ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:border-slate-400"
            }`}
          >
            {cat === "all" ? "All" : OPPORTUNITY_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
          onViewDetail={onViewDetail}
        />
      )}

      {view === "list" && (
      <>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pageRows.map((row) => {
          const effective = effectiveOpportunityCategory(row.score);
          return (
            <div key={row.score.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {onViewDetail ? (
                    <button
                      type="button"
                      onClick={() => onViewDetail(row.score.lead_id)}
                      className="break-words text-left font-bold text-slate-900 hover:text-sky-700"
                    >
                      {row.businessName}
                    </button>
                  ) : (
                    <div className="break-words font-bold text-slate-900">{row.businessName}</div>
                  )}
                  <div className="break-words text-[13px] text-slate-500">{row.contactName || "No contact name"}</div>
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
                {row.phone && (
                  <a href={`tel:${row.phone}`} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-slate-400">
                    Call
                  </a>
                )}
                {row.email && (
                  <a href={`mailto:${row.email}`} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-slate-400">
                    Email
                  </a>
                )}
                {onViewDetail ? (
                  <button
                    type="button"
                    onClick={() => onViewDetail(row.score.lead_id)}
                    className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11.5px] font-semibold text-indigo-700 hover:border-indigo-400"
                  >
                    View Lead
                  </button>
                ) : (
                  <Link href={row.detailHref} className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11.5px] font-semibold text-indigo-700 hover:border-indigo-400">
                    View Lead
                  </Link>
                )}
                <Link href={row.detailHref} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-slate-400">
                  Book Appointment
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setNotingId(notingId === row.score.id ? null : row.score.id);
                    setNoteDraft("");
                  }}
                  className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-slate-400"
                >
                  Add Note
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSchedulingId(schedulingId === row.score.id ? null : row.score.id);
                    setCallbackDraft("");
                  }}
                  className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-slate-400"
                >
                  Set Callback
                </button>
                <button
                  type="button"
                  disabled={isPending || !row.followUpId}
                  title={row.followUpId ? undefined : "No pending callback to complete"}
                  onClick={() => row.followUpId && runAction(() => onCompleteFollowUp(row.followUpId!, row.score.lead_id))}
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11.5px] font-semibold text-emerald-700 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Mark Complete
                </button>
              </div>

              {notingId === row.score.id && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Quick note..."
                    className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]"
                  />
                  <button
                    type="button"
                    disabled={isPending || !noteDraft.trim()}
                    onClick={() => {
                      const note = noteDraft.trim();
                      runAction(() => onAddNote(row.score.lead_id, note), () => setNotingId(null));
                    }}
                    className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11.5px] font-semibold text-sky-700 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              )}
              {schedulingId === row.score.id && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input
                    type="datetime-local"
                    value={callbackDraft}
                    onChange={(e) => setCallbackDraft(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]"
                  />
                  <button
                    type="button"
                    disabled={isPending || !callbackDraft}
                    onClick={() => {
                      const formData = new FormData();
                      formData.set("scheduled_at", callbackDraft);
                      runAction(() => onScheduleCallback(row.score.lead_id, formData), () => setSchedulingId(null));
                    }}
                    className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11.5px] font-semibold text-sky-700 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              )}

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
      {visible.length > 0 && (
        <RowsPerPagePager
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          totalCount={totalCount}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
        />
      )}
      </>
      )}
    </div>
  );
}
