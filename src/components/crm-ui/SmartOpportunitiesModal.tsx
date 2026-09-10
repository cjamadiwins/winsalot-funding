"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CircleCheck, Flame, Search, Sparkles, X } from "lucide-react";
import {
  OPPORTUNITY_PRIORITY_LABELS,
  OPPORTUNITY_PRIORITY_LEVELS,
  OPPORTUNITY_PRIORITY_STYLES,
  opportunityPriorityLevel,
  type OpportunityPriorityLevel,
} from "@/lib/opportunity-finder";

export type SmartOpportunityRow = {
  scoreId: string;
  prospectId: string;
  businessName: string;
  clientOrBusiness: string;
  clientId: string | null;
  campaignName: string;
  campaignId: string | null;
  agentName: string;
  agentId: string | null;
  score: number;
  lastContactAt: string | null;
  lastCallOutcome: string | null;
  followUpAt: string | null;
  followUpId: string | null;
  latestNote: string | null;
  explanation: string;
  recommendedAction: string;
  detailHref: string;
  logCallHref: string;
  bookAppointmentHref: string;
};

type ActionResult = { error?: string };
type FilterOption = { id: string; name: string };

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function followUpStatus(value: string | null): string {
  if (!value) return "None scheduled";
  const due = new Date(value);
  const now = new Date();
  if (due.getTime() < now.getTime()) return `Overdue · ${formatDate(value)}`;
  if (due.toDateString() === now.toDateString()) return `Due today · ${formatDate(value)}`;
  return `Scheduled · ${formatDate(value)}`;
}

export default function SmartOpportunitiesModal({
  rows,
  agents = [],
  clients = [],
  campaigns = [],
  adminMode = false,
  onAddNote,
  onCompleteFollowUp,
  onMarkHandled,
}: {
  rows: SmartOpportunityRow[];
  agents?: FilterOption[];
  clients?: FilterOption[];
  campaigns?: FilterOption[];
  adminMode?: boolean;
  onAddNote: (prospectId: string, note: string) => Promise<ActionResult>;
  onCompleteFollowUp: (followUpId: string, prospectId: string) => Promise<ActionResult | void>;
  onMarkHandled?: (scoreId: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<OpportunityPriorityLevel | "all">("all");
  const [minimumScore, setMinimumScore] = useState(0);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const [handledIds, setHandledIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hotCount = rows.filter((row) => !handledIds.has(row.scoreId) && opportunityPriorityLevel(row.score) === "hot").length;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (handledIds.has(row.scoreId)) return false;
        const priority = opportunityPriorityLevel(row.score);
        if (agentFilter !== "all" && row.agentId !== agentFilter) return false;
        if (clientFilter !== "all" && row.clientId !== clientFilter) return false;
        if (campaignFilter !== "all" && row.campaignId !== campaignFilter) return false;
        if (priorityFilter !== "all" && priority !== priorityFilter) return false;
        if (row.score < minimumScore) return false;
        if (query && !`${row.businessName} ${row.clientOrBusiness} ${row.campaignName}`.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }, [rows, search, agentFilter, clientFilter, campaignFilter, priorityFilter, minimumScore, handledIds]);

  function runAction(action: () => Promise<ActionResult | void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result && result.error) setError(result.error);
        else onSuccess?.();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-indigo-600 p-2.5 text-white"><Sparkles className="h-5 w-5" /></span>
          <div>
            <div className="text-[16px] font-bold text-slate-900">Smart Opportunities</div>
            <div className="mt-0.5 text-[12.5px] text-slate-600">Open ranked prospects without leaving your dashboard.</div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-[12px] font-bold text-red-800">
          <Flame className="h-3.5 w-3.5" /> {hotCount} Hot
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-opportunities-title"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h2 id="smart-opportunities-title" className="text-xl font-bold text-slate-900">Smart Opportunities</h2>
                <p className="mt-1 text-[13px] text-slate-500">Ranked from current CRM activity. Scores update automatically as prospect activity changes.</p>
              </div>
              <button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Close Smart Opportunities" className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap gap-2">
                <label className="flex min-w-[210px] flex-1 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input aria-label="Search prospects" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search prospect or business..." className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
                </label>
                {adminMode && (
                  <>
                    <select aria-label="Filter by agent" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} className="max-w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]">
                      <option value="all">All Agents</option>
                      {agents.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                    <select aria-label="Filter by business or client" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="max-w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]">
                      <option value="all">All Businesses / Clients</option>
                      {clients.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                    <select aria-label="Filter by campaign or niche" value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} className="max-w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]">
                      <option value="all">All Campaigns / Niches</option>
                      {campaigns.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                  </>
                )}
                <select aria-label="Filter by priority level" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as OpportunityPriorityLevel | "all")} className="max-w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]">
                  <option value="all">All Priority Levels</option>
                  {OPPORTUNITY_PRIORITY_LEVELS.map((level) => <option key={level} value={level}>{OPPORTUNITY_PRIORITY_LABELS[level]}</option>)}
                </select>
                {adminMode && (
                  <select aria-label="Filter by minimum score" value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} className="max-w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]">
                    <option value={0}>Any Score</option>
                    <option value={40}>40+</option>
                    <option value={60}>60+</option>
                    <option value={80}>80+</option>
                  </select>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6">
              {error && <p className="my-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
              {filtered.length === 0 ? (
                <div className="py-12 text-center"><CircleCheck className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-2 text-sm font-semibold text-slate-700">No matching opportunities.</p></div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map((row) => {
                    const priority = opportunityPriorityLevel(row.score);
                    const explanation = row.explanation.length > 180 ? `${row.explanation.slice(0, 180)}…` : row.explanation;
                    return (
                      <article key={row.scoreId} className="min-w-0 break-words py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900">{row.businessName}</span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${OPPORTUNITY_PRIORITY_STYLES[priority]}`}>{row.score} · {OPPORTUNITY_PRIORITY_LABELS[priority]}</span>
                            </div>
                            <p className="mt-1 text-[12.5px] text-slate-500">{row.clientOrBusiness} · {row.campaignName} · {row.agentName}</p>
                          </div>
                          <span className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] font-bold text-slate-800">{row.recommendedAction}</span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-3">
                          <div className="rounded-lg bg-slate-50 p-2.5"><span className="text-slate-400">Last contact</span><div className="font-medium text-slate-700">{formatDate(row.lastContactAt)}</div></div>
                          <div className="rounded-lg bg-slate-50 p-2.5"><span className="text-slate-400">Latest call outcome</span><div className="font-medium text-slate-700">{row.lastCallOutcome || "—"}</div></div>
                          <div className="rounded-lg bg-slate-50 p-2.5"><span className="text-slate-400">Follow-up</span><div className="font-medium text-slate-700">{followUpStatus(row.followUpAt)}</div></div>
                        </div>
                        {row.latestNote && <p className="mt-2 text-[12.5px] text-slate-600"><span className="font-semibold text-slate-700">Latest note:</span> {row.latestNote}</p>}
                        <p className="mt-2 text-[12.5px] text-slate-600"><span className="font-semibold text-slate-700">Why this score:</span> {explanation}</p>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Link href={row.detailHref} className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11.5px] font-semibold text-indigo-700">View Prospect</Link>
                          <button type="button" onClick={() => { setNoteId(noteId === row.scoreId ? null : row.scoreId); setNote(""); }} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700">Add Note</button>
                          <Link href={row.logCallHref} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700">Log Call</Link>
                          <button
                            type="button"
                            disabled={isPending || !row.followUpId || completedIds.has(row.scoreId)}
                            title={row.followUpId ? undefined : "No pending follow-up"}
                            onClick={() => row.followUpId && runAction(() => onCompleteFollowUp(row.followUpId!, row.prospectId), () => setCompletedIds((current) => new Set(current).add(row.scoreId)))}
                            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11.5px] font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {completedIds.has(row.scoreId) ? "Follow-Up Completed" : "Complete Follow-Up"}
                          </button>
                          <Link href={row.bookAppointmentHref} className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11.5px] font-semibold text-sky-700">Book Appointment</Link>
                          {onMarkHandled && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => runAction(() => onMarkHandled(row.scoreId), () => setHandledIds((current) => new Set(current).add(row.scoreId)))}
                              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-[11.5px] font-semibold text-slate-700 disabled:opacity-40"
                            >
                              Handled Today
                            </button>
                          )}
                        </div>

                        {noteId === row.scoreId && (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <input aria-label={`Add a note for ${row.businessName}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a short note..." className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-[13px]" />
                            <button
                              type="button"
                              disabled={isPending || !note.trim()}
                              onClick={() => runAction(() => onAddNote(row.prospectId, note.trim()), () => { setNoteId(null); setNote(""); })}
                              className="rounded-lg bg-sky-700 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                            >
                              Save Note
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-6">
              <span className="text-[12px] text-slate-500">{filtered.length} ranked prospect{filtered.length === 1 ? "" : "s"}</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-900 px-4 py-2 text-[12.5px] font-semibold text-white">Close</button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
