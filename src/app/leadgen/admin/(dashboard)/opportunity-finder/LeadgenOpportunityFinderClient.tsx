"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  effectiveOpportunityCategory,
  OPPORTUNITY_CATEGORIES,
  OPPORTUNITY_CATEGORY_DESCRIPTIONS,
  OPPORTUNITY_CATEGORY_LABELS,
  OPPORTUNITY_CATEGORY_STYLES,
  PRIORITY_OVERRIDE_OPTIONS,
  type LeadgenOpportunityScoreRow,
  type OpportunityCategory,
  type OpportunityPriorityOverride,
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
import {
  assignFinderLeadAgentAction,
  dismissFinderOpportunityAction,
  reopenFinderOpportunityAction,
  setFinderPriorityOverrideAction,
} from "./actions";

export type LeadgenOpportunityFinderRow = {
  score: LeadgenOpportunityScoreRow;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  clientId: string;
  clientName: string | null;
  clientOrBusiness: string;
  campaignId: string | null;
  campaignName: string | null;
  industry: string | null;
  nextFollowUpAt: string | null;
  lastCallAt: string | null;
  lastEmailAt: string | null;
  lastNote: string | null;
  notes: string[];
  lastCallOutcome: string | null;
  appointmentStatus: string | null;
  // The earliest pending callback for this lead, if any - what the row's
  // "Mark Complete" quick action completes.
  followUpId: string | null;
  detailHref: string;
};

const inputClass = "rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function isOverdue(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

function isDueToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

type FollowUpFilter = "all" | "scheduled" | "today" | "overdue";
type ActionResult = { error?: string };

export default function LeadgenOpportunityFinderClient({
  rows,
  agents,
  clients,
  campaigns,
  industries,
  initialCategory,
  initialAgentFilter,
  initialClientFilter,
  initialFollowUpFilter,
  initialIndustryFilter,
  initialView,
  onAddNote,
  onScheduleCallback,
  onCompleteFollowUp,
  onViewDetail,
}: {
  rows: LeadgenOpportunityFinderRow[];
  agents: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  campaigns: { id: string; name: string; clientId: string }[];
  industries: string[];
  initialCategory?: string;
  initialAgentFilter?: string;
  initialClientFilter?: string;
  initialFollowUpFilter?: string;
  initialIndustryFilter?: string;
  initialView?: "list" | "board";
  onAddNote: (leadId: string, note: string) => Promise<{ error?: string }>;
  onScheduleCallback: (leadId: string, formData: FormData) => Promise<ActionResult>;
  onCompleteFollowUp: (followUpId: string, leadId: string) => Promise<ActionResult>;
  // Set only when rendered inside the Opportunity Finder dashboard modal -
  // "View Lead" then switches the modal to its inline detail view instead
  // of navigating to /leadgen/admin/leads/[id]. Omitted on the standalone
  // /leadgen/admin/opportunity-finder page, which keeps its normal
  // Link-based navigation exactly as before.
  onViewDetail?: (id: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">(initialView ?? "list");
  const [categoryFilter, setCategoryFilter] = useState<OpportunityCategory | "all">(
    initialCategory && OPPORTUNITY_CATEGORIES.includes(initialCategory as OpportunityCategory) ? (initialCategory as OpportunityCategory) : "all"
  );
  const [agentFilter, setAgentFilter] = useState(initialAgentFilter && agents.some((a) => a.id === initialAgentFilter) ? initialAgentFilter : "all");
  const [clientFilter, setClientFilter] = useState(initialClientFilter && clients.some((c) => c.id === initialClientFilter) ? initialClientFilter : "all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<LeadgenLeadStatus | "all">("all");
  const [industryFilter, setIndustryFilter] = useState(
    initialIndustryFilter && industries.includes(initialIndustryFilter) ? initialIndustryFilter : "all"
  );
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>(
    initialFollowUpFilter === "overdue" || initialFollowUpFilter === "today" || initialFollowUpFilter === "scheduled" || initialFollowUpFilter === "due"
      ? initialFollowUpFilter === "due"
        ? "scheduled"
        : initialFollowUpFilter
      : "all"
  );
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [callbackDraft, setCallbackDraft] = useState("");
  const [notingId, setNotingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && "error" in result && result.error) setError(result.error);
        else router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const campaignsForClient = clientFilter === "all" ? campaigns : campaigns.filter((c) => c.clientId === clientFilter);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const effective = effectiveOpportunityCategory(row.score);
      if (categoryFilter !== "all" && effective !== categoryFilter) return false;
      if (agentFilter !== "all" && row.assignedAgentId !== agentFilter) return false;
      if (clientFilter !== "all" && row.clientId !== clientFilter) return false;
      if (campaignFilter !== "all" && row.campaignId !== campaignFilter) return false;
      if (stageFilter !== "all" && row.status !== stageFilter) return false;
      if (industryFilter !== "all" && row.industry !== industryFilter) return false;
      if (followUpFilter === "scheduled" && !row.nextFollowUpAt) return false;
      if (followUpFilter === "today" && !isDueToday(row.nextFollowUpAt)) return false;
      if (followUpFilter === "overdue" && !isOverdue(row.nextFollowUpAt)) return false;
      if (dateFilter) {
        if (!row.nextFollowUpAt) return false;
        const rowDate = new Date(row.nextFollowUpAt);
        const [y, m, d] = dateFilter.split("-").map(Number);
        if (rowDate.getFullYear() !== y || rowDate.getMonth() + 1 !== m || rowDate.getDate() !== d) return false;
      }
      if (query && !(row.businessName.toLowerCase().includes(query) || (row.contactName ?? "").toLowerCase().includes(query))) return false;
      return true;
    });
  }, [rows, categoryFilter, agentFilter, clientFilter, campaignFilter, stageFilter, industryFilter, followUpFilter, dateFilter, search]);

  const boardCards: OpportunityBoardCard[] = useMemo(
    () =>
      filtered.map((row) => ({
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
        viewHref: `${row.detailHref}?from=opportunity-finder`,
        editHref: `${row.detailHref}?from=opportunity-finder`,
      })),
    [filtered]
  );

  const boardColumns = LEADGEN_LEAD_STATUSES.map((status) => ({ key: status, label: status, styleClass: LEADGEN_LEAD_STATUS_STYLES[status] }));

  const { pageRows, page, pageCount, pageSize, setPage, setPageSize, totalCount, rangeStart, rangeEnd } = usePagedRows(filtered);

  return (
    <div className="mt-6">
      {error && <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
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
        {(["all", ...OPPORTUNITY_CATEGORIES] as const).map((cat) => (
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
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className={inputClass}>
          <option value="all">All Agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={clientFilter}
          onChange={(e) => {
            setClientFilter(e.target.value);
            setCampaignFilter("all");
          }}
          className={inputClass}
        >
          <option value="all">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className={inputClass}>
          <option value="all">All Campaigns</option>
          {campaignsForClient.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as LeadgenLeadStatus | "all")} className={inputClass}>
          <option value="all">All Stages</option>
          {LEADGEN_LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        {industries.length > 0 && (
          <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} className={inputClass}>
            <option value="all">All Industries</option>
            {industries.map((industry) => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </select>
        )}
        <select value={followUpFilter} onChange={(e) => setFollowUpFilter(e.target.value as FollowUpFilter)} className={inputClass}>
          <option value="all">Any Follow-Up</option>
          <option value="scheduled">Has a Follow-Up Scheduled</option>
          <option value="today">Due Today</option>
          <option value="overdue">Overdue</option>
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          title="Filter by follow-up date"
          className={inputClass}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business or contact..."
          className={`${inputClass} min-w-[220px] flex-1`}
        />
      </div>

      {view === "board" && <OpportunityBoardView columns={boardColumns} cards={boardCards} onAddNote={onAddNote} onViewDetail={onViewDetail} />}

      {view === "list" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {pageRows.map((row) => {
              const effective = effectiveOpportunityCategory(row.score);
              const dismissed = row.score.finder_state === "dismissed";
              return (
                <div key={row.score.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {onViewDetail ? (
                        <button
                          type="button"
                          onClick={() => onViewDetail(row.score.lead_id)}
                          className="break-words text-left font-bold text-sky-700 underline decoration-sky-300 decoration-1 underline-offset-2 hover:text-sky-800 hover:decoration-sky-500"
                        >
                          {row.businessName}
                        </button>
                      ) : (
                        <Link
                          href={`${row.detailHref}?from=opportunity-finder`}
                          className="break-words font-bold text-sky-700 underline decoration-sky-300 decoration-1 underline-offset-2 hover:text-sky-800 hover:decoration-sky-500"
                        >
                          {row.businessName}
                        </Link>
                      )}
                      <div className="break-words text-[13px] text-slate-500">{row.contactName || "No contact name"}</div>
                      <div className="break-words text-[11px] text-slate-400">
                        {row.status} · {row.clientName || "No client"} · {row.campaignName || "No campaign"}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xl font-extrabold text-slate-900">{row.score.score}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${OPPORTUNITY_CATEGORY_STYLES[effective]}`}>
                        {OPPORTUNITY_CATEGORY_LABELS[effective]}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Agent
                      <select
                        value={row.assignedAgentId ?? ""}
                        onChange={(e) => runAction(() => assignFinderLeadAgentAction(row.score.lead_id, e.target.value || null))}
                        disabled={isPending}
                        className={`${inputClass} mt-1 w-full normal-case`}
                      >
                        <option value="">Unassigned</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Priority Override
                      <select
                        value={row.score.priority_override ?? ""}
                        onChange={(e) =>
                          runAction(() =>
                            setFinderPriorityOverrideAction(row.score.id, (e.target.value || null) as OpportunityPriorityOverride | null)
                          )
                        }
                        disabled={isPending}
                        className={`${inputClass} mt-1 w-full normal-case`}
                      >
                        <option value="">No override</option>
                        {PRIORITY_OVERRIDE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {OPPORTUNITY_CATEGORY_LABELS[opt]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px] text-slate-600">
                    <div>
                      <dt className="text-slate-400">Last call</dt>
                      <dd className="break-words">{fmt(row.lastCallAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Last email</dt>
                      <dd className="break-words">{fmt(row.lastEmailAt)}</dd>
                    </div>
                    <div className={isOverdue(row.nextFollowUpAt) ? "font-semibold text-rose-600" : ""}>
                      <dt className={isOverdue(row.nextFollowUpAt) ? "text-rose-400" : "text-slate-400"}>Follow-up</dt>
                      <dd className="break-words">{fmt(row.nextFollowUpAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Last note</dt>
                      <dd className="break-words">{row.lastNote || "—"}</dd>
                    </div>
                  </dl>

                  <ul className="mt-3 list-disc space-y-0.5 break-words pl-4 text-[12.5px] text-slate-600">
                    {row.score.reasons.slice(0, 3).map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  <div className="mt-2 break-words rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] font-semibold text-slate-800">{row.score.recommended_action}</div>

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
                      <Link
                        href={`${row.detailHref}?from=opportunity-finder`}
                        className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11.5px] font-semibold text-indigo-700 hover:border-indigo-400"
                      >
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
                    {dismissed ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => reopenFinderOpportunityAction(row.score.id))}
                        className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11.5px] font-semibold text-emerald-700 hover:border-emerald-400"
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDismissingId(dismissingId === row.score.id ? null : row.score.id)}
                        className="rounded-full border border-rose-300 px-3 py-1 text-[11.5px] font-semibold text-rose-700 hover:border-rose-400"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>

                  {notingId === row.score.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <input
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Quick note..."
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]"
                      />
                      <button
                        type="button"
                        disabled={isPending || !noteDraft.trim()}
                        onClick={() => {
                          const note = noteDraft.trim();
                          runAction(() => onAddNote(row.score.lead_id, note));
                          setNotingId(null);
                          setNoteDraft("");
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
                          runAction(() => onScheduleCallback(row.score.lead_id, formData));
                          setSchedulingId(null);
                          setCallbackDraft("");
                        }}
                        className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11.5px] font-semibold text-sky-700 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  )}
                  {dismissingId === row.score.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <input
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                        placeholder="Reason for dismissing"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]"
                      />
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          runAction(() => dismissFinderOpportunityAction(row.score.id, dismissReason));
                          setDismissingId(null);
                          setDismissReason("");
                        }}
                        className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-[11.5px] font-semibold text-rose-700 hover:border-rose-400"
                      >
                        Confirm Dismiss
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="col-span-full py-10 text-center text-slate-400">No opportunities match these filters.</div>}
          </div>
          {filtered.length > 0 && (
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
