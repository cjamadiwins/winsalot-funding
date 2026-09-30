"use client";

import { Eye } from "lucide-react";
import { SCRIPT_DISPLAY, type ScriptDisplayState } from "@/lib/leadgen-script-status";
import type { ScriptSessionPayload } from "@/lib/leadgen-script-session-types";
import { ScriptSessionRegister } from "./ScriptDockWidgets";
import { useScriptDock } from "./ScriptDockProvider";

export type AgentScriptStatusRowData = {
  agentId: string;
  agentName: string;
  payload: ScriptSessionPayload;
  state: ScriptDisplayState;
  openedAt: string | null;
  lastActivityAt: string | null;
};

const TONE_CLASSES = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-800",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  gray: "border-slate-300 bg-slate-100 text-slate-700",
} as const;

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

// Admin-only. Green = open; amber/gray = closed / needs attention. Never red.
export default function AgentScriptStatusCard({ rows, previewSessions }: { rows: AgentScriptStatusRowData[]; previewSessions: ScriptSessionPayload[] }) {
  const { openScript } = useScriptDock();
  return (
    <section id="agent-script-status" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <ScriptSessionRegister sessions={previewSessions} replace />
      <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-700">Agent Script Status</h2>
      <p className="mt-1 text-sm text-slate-500">Whether each agent currently has their approved call script open while working an assigned list. Updates when this page refreshes.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No agents are assigned to an active call list.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((row) => {
            const display = SCRIPT_DISPLAY[row.state];
            return (
              <li key={`${row.agentId}:${row.payload.segmentId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {row.agentName} — {row.payload.clientName} — <span className="text-slate-600">{row.payload.campaignName}</span>
                    {(row.state === "open" || row.state === "closed_working") && <span className="text-slate-500"> · {row.payload.segmentName}</span>}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    Opened: {fmt(row.openedAt)} · Last script activity: {fmt(row.lastActivityAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span data-testid="script-state" className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${TONE_CLASSES[display.tone]}`}>
                    {display.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => openScript(row.payload.segmentId, { previewAgentName: row.agentName })}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
