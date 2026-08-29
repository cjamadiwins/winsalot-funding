"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  effectiveOpportunityCategory,
  OPPORTUNITY_CATEGORIES,
  OPPORTUNITY_CATEGORY_LABELS,
  OPPORTUNITY_CATEGORY_STYLES,
  type CrmOpportunityScoreRow,
  type OpportunityCategory,
} from "@/lib/opportunity-finder";
import { assignOpportunityAgentAction, dismissOpportunityAction, reopenOpportunityAction, setOpportunityPriorityOverrideAction } from "./actions";

export type OpportunityFinderRow = {
  score: CrmOpportunityScoreRow;
  businessName: string;
  contactName: string | null;
  phone: string;
  email: string | null;
  stageOrStatus: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  lastCallAt: string | null;
  lastEmailAt: string | null;
  lastNote: string | null;
  lastNoteAt: string | null;
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

export default function OpportunityFinderClient({
  rows,
  agents,
  initialCategory,
  initialAgentFilter,
  initialFollowUpFilter,
}: {
  rows: OpportunityFinderRow[];
  agents: { id: string; name: string }[];
  initialCategory?: string;
  initialAgentFilter?: string;
  initialFollowUpFilter?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<OpportunityCategory | "all">(
    initialCategory && OPPORTUNITY_CATEGORIES.includes(initialCategory as OpportunityCategory) ? (initialCategory as OpportunityCategory) : "all"
  );
  const [agentFilter, setAgentFilter] = useState(initialAgentFilter && agents.some((a) => a.id === initialAgentFilter) ? initialAgentFilter : "all");
  const [followUpFilter, setFollowUpFilter] = useState(initialFollowUpFilter === "due" ? "due" : "all");
  const [search, setSearch] = useState("");
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      else router.refresh();
    });
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const effective = effectiveOpportunityCategory(row.score);
      if (categoryFilter !== "all" && effective !== categoryFilter) return false;
      if (agentFilter !== "all" && row.assignedAgentId !== agentFilter) return false;
      if (followUpFilter === "due" && !row.nextFollowUpAt) return false;
      if (query && !(row.businessName.toLowerCase().includes(query) || (row.contactName ?? "").toLowerCase().includes(query))) return false;
      return true;
    });
  }, [rows, categoryFilter, agentFilter, followUpFilter, search]);

  return (
    <div className="mt-6">
      {error && <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...OPPORTUNITY_CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
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
        <select value={followUpFilter} onChange={(e) => setFollowUpFilter(e.target.value as "all" | "due")} className={inputClass}>
          <option value="all">Any Follow-Up</option>
          <option value="due">Has a Follow-Up Scheduled</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business or contact..."
          className={`${inputClass} min-w-[220px] flex-1`}
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1200px] text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Business / Contact</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Last Call</th>
              <th className="px-4 py-3">Last Email</th>
              <th className="px-4 py-3">Last Note</th>
              <th className="px-4 py-3">Follow-Up</th>
              <th className="px-4 py-3">Why / Next Action</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((row) => {
              const effective = effectiveOpportunityCategory(row.score);
              const dismissed = row.score.finder_state === "dismissed";
              return (
                <tr key={row.score.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{row.businessName}</div>
                    <div className="text-slate-500">{row.contactName || "—"}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{row.stageOrStatus}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.assignedAgentId ?? ""}
                      onChange={(e) => runAction(() => assignOpportunityAgentAction(row.score.opportunity_id, e.target.value || null))}
                      disabled={isPending}
                      className={inputClass}
                    >
                      <option value="">Unassigned</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold text-slate-900">{row.score.score}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${OPPORTUNITY_CATEGORY_STYLES[effective]}`}>
                        {OPPORTUNITY_CATEGORY_LABELS[effective]}
                      </span>
                    </div>
                    <select
                      value={row.score.priority_override ?? ""}
                      onChange={(e) =>
                        runAction(() => setOpportunityPriorityOverrideAction(row.score.id, (e.target.value || null) as "high" | "medium" | "low" | null))
                      }
                      disabled={isPending}
                      className={`${inputClass} mt-2`}
                    >
                      <option value="">No manual override</option>
                      <option value="high">Override: High</option>
                      <option value="medium">Override: Medium</option>
                      <option value="low">Override: Low</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmt(row.lastCallAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(row.lastEmailAt)}</td>
                  <td className="px-4 py-3 max-w-[220px] text-slate-600">
                    {row.lastNote ? <span title={row.lastNote}>{row.lastNote.length > 80 ? `${row.lastNote.slice(0, 80)}…` : row.lastNote}</span> : "—"}
                  </td>
                  <td className={`px-4 py-3 ${isOverdue(row.nextFollowUpAt) ? "font-semibold text-rose-600" : "text-slate-600"}`}>
                    {fmt(row.nextFollowUpAt)}
                  </td>
                  <td className="px-4 py-3 max-w-[280px]">
                    <ul className="list-disc pl-4 text-slate-600">
                      {row.score.reasons.slice(0, 3).map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                    <div className="mt-1.5 font-semibold text-slate-800">{row.score.recommended_action}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
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
                      {dismissed ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => reopenOpportunityAction(row.score.id))}
                          className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11.5px] font-semibold text-emerald-700 hover:border-emerald-400"
                        >
                          Reopen
                        </button>
                      ) : dismissingId === row.score.id ? (
                        <span className="flex items-center gap-1">
                          <input
                            value={dismissReason}
                            onChange={(e) => setDismissReason(e.target.value)}
                            placeholder="Reason"
                            className="rounded-lg border border-slate-300 px-2 py-1 text-[11.5px]"
                          />
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              runAction(() => dismissOpportunityAction(row.score.id, dismissReason));
                              setDismissingId(null);
                              setDismissReason("");
                            }}
                            className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-[11.5px] font-semibold text-rose-700 hover:border-rose-400"
                          >
                            Confirm
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDismissingId(row.score.id)}
                          className="rounded-full border border-rose-300 px-3 py-1 text-[11.5px] font-semibold text-rose-700 hover:border-rose-400"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  No opportunities match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
