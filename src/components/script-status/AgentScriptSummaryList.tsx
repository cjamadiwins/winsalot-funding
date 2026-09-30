"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { SCRIPT_DISPLAY, type ScriptDisplayState } from "@/lib/leadgen-script-status";
import { overallScriptLabel, relativeActivityLabel, summarizeByAgent, type AgentScriptSummary, type ScriptStatusDetail } from "@/lib/script-status-summary";

// Shared Admin-only presentation for both CRMs: one compact row per agent, with
// campaign-level detail in a scrollable popup. The per-CRM card decides what the
// "owner" column means (Growth: Winsalot Corp; Lead Gen: the assigned client).

export type ScriptDetailRow = ScriptStatusDetail & {
  key: string;
  owner: string;
  campaign: string;
  // Current list, only shown when it is known to be accurate (open / working).
  list: string | null;
  service: string | null;
  previewSegmentId: string;
};

const DOT = { green: "bg-emerald-500", amber: "bg-amber-500", gray: "bg-slate-400" } as const;
const BADGE = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-800",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  gray: "border-slate-300 bg-slate-100 text-slate-700",
} as const;

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function AgentScriptSummaryRow({ summary, onViewDetails }: { summary: AgentScriptSummary; onViewDetails: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-[13px]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span data-testid="script-dot" className={`h-2 w-2 shrink-0 rounded-full ${DOT[summary.tone]}`} aria-hidden />
        <span className="font-semibold text-slate-900">{summary.agentName}</span>
        <span data-testid="script-state" className={`rounded-full border px-2 py-px text-[11px] font-semibold ${BADGE[summary.tone]}`}>
          {overallScriptLabel(summary.isOpen)}
        </span>
        <span className="text-slate-600">
          {summary.campaignCount} campaign{summary.campaignCount === 1 ? "" : "s"}
          {" · "}
          {summary.focus ? `${summary.focus.kind === "current" ? "Current" : "Last"}: ${summary.focus.label}` : "Last: —"}
          {" · Activity: "}
          <span suppressHydrationWarning>{relativeActivityLabel(summary.lastActivityAt)}</span>
        </span>
      </div>
      <button type="button" onClick={onViewDetails} className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
        View Details
      </button>
    </li>
  );
}

export function AgentScriptDetailsTable({ rows, ownerHeader, onPreview }: { rows: ScriptDetailRow[]; ownerHeader: string; onPreview: (row: ScriptDetailRow) => void }) {
  return (
    <table className="w-full text-left text-[12.5px]">
      <thead>
        <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <th className="py-1.5 pr-3">{ownerHeader}</th>
          <th className="py-1.5 pr-3">Campaign / List</th>
          <th className="py-1.5 pr-3">Service / Industry</th>
          <th className="py-1.5 pr-3">Script</th>
          <th className="py-1.5 pr-3">Opened At</th>
          <th className="py-1.5 pr-3">Last Activity</th>
          <th className="py-1.5" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const display = SCRIPT_DISPLAY[row.state as ScriptDisplayState];
          return (
            <tr key={row.key} className="border-b border-slate-100 align-top">
              <td className="py-1.5 pr-3 font-medium text-slate-900">{row.owner}</td>
              <td className="py-1.5 pr-3 text-slate-800">
                {row.campaign}
                {row.list && <span className="block text-[11.5px] text-slate-500">{row.list}</span>}
              </td>
              <td className="py-1.5 pr-3 text-slate-700">{row.service ?? "—"}</td>
              <td className="py-1.5 pr-3">
                <span className={`whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-semibold ${BADGE[display.tone]}`}>{display.label}</span>
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">{fmt(row.openedAt)}</td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">{fmt(row.lastActivityAt)}</td>
              <td className="py-1.5">
                <button type="button" onClick={() => onPreview(row)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-300 bg-white px-2 py-px text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50">
                  <Eye className="h-3 w-3" /> Preview Script
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function AgentScriptSummaryList({
  details,
  ownerHeader,
  onPreview,
  emptyMessage,
}: {
  details: ScriptDetailRow[];
  ownerHeader: string;
  onPreview: (row: ScriptDetailRow) => void;
  emptyMessage: string;
}) {
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const summaries = summarizeByAgent(details);
  const selected = summaries.find((s) => s.agentId === openAgentId) ?? null;

  useEffect(() => {
    if (!openAgentId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAgentId(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openAgentId]);

  if (summaries.length === 0) return <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>;

  return (
    <>
      <ul className="mt-2 divide-y divide-slate-100">
        {summaries.map((s) => (
          <AgentScriptSummaryRow key={s.agentId} summary={s} onViewDetails={() => setOpenAgentId(s.agentId)} />
        ))}
      </ul>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setOpenAgentId(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.agentName} script status`}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-t-2xl bg-[var(--crm-surface)] shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${DOT[selected.tone]}`} aria-hidden />
                <h3 className="text-[15px] font-bold text-slate-900">{selected.agentName}</h3>
                <span className={`rounded-full border px-2 py-px text-[11px] font-semibold ${BADGE[selected.tone]}`}>{overallScriptLabel(selected.isOpen)}</span>
              </div>
              <button type="button" onClick={() => setOpenAgentId(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                ✕
              </button>
            </div>
            <div className="overflow-auto px-4 py-2">
              <AgentScriptDetailsTable
                rows={details.filter((d) => d.agentId === selected.agentId)}
                ownerHeader={ownerHeader}
                onPreview={(row) => {
                  setOpenAgentId(null);
                  onPreview(row);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
