"use client";

import type { ScriptDisplayState } from "@/lib/leadgen-script-status";
import type { ScriptSessionPayload } from "@/lib/leadgen-script-session-types";
import AgentScriptSummaryList, { type ScriptDetailRow } from "@/components/script-status/AgentScriptSummaryList";
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

// Admin-only. One compact row per agent; campaign-level detail (with the actual
// assigned client per campaign) opens in a popup. Green = open; amber/gray =
// closed / needs attention. Never red.
export default function AgentScriptStatusCard({ rows, previewSessions }: { rows: AgentScriptStatusRowData[]; previewSessions: ScriptSessionPayload[] }) {
  const { openScript } = useScriptDock();
  const details: ScriptDetailRow[] = rows.map((row) => ({
    key: `${row.agentId}:${row.payload.campaignId}`,
    agentId: row.agentId,
    agentName: row.agentName,
    state: row.state,
    openedAt: row.openedAt,
    lastActivityAt: row.lastActivityAt,
    campaignLabel: row.payload.campaignName,
    owner: row.payload.clientName,
    campaign: row.payload.campaignName,
    // The representative list is only accurate while the script is open / being worked.
    list: row.state === "open" || row.state === "closed_working" ? row.payload.segmentName : null,
    service: row.payload.industry,
    previewSegmentId: row.payload.segmentId,
  }));

  return (
    <section id="agent-script-status" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] px-4 py-3">
      <ScriptSessionRegister sessions={previewSessions} replace />
      <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-700">Agent Script Status</h2>
      <AgentScriptSummaryList
        details={details}
        ownerHeader="Client"
        emptyMessage="No agents are assigned to an active call list."
        onPreview={(row) => openScript(row.previewSegmentId, { previewAgentName: row.agentName })}
      />
    </section>
  );
}
