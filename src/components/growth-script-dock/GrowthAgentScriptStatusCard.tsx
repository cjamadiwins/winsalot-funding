"use client";

import type { ScriptDisplayState } from "@/lib/leadgen-script-status";
import type { GrowthScriptSessionPayload } from "@/lib/growth-script-session-types";
import { GROWTH_CALL_LIST_OWNER } from "@/lib/growth-call-list-owner";
import AgentScriptSummaryList, { type ScriptDetailRow } from "@/components/script-status/AgentScriptSummaryList";
import { GrowthScriptSessionRegister } from "./GrowthScriptDockWidgets";
import { useGrowthScriptDock } from "./GrowthScriptDockProvider";

export type GrowthAgentScriptStatusRowData = {
  agentId: string;
  agentName: string;
  payload: GrowthScriptSessionPayload;
  state: ScriptDisplayState;
  openedAt: string | null;
  lastActivityAt: string | null;
};

// Admin-only. One compact row per agent; per-list detail opens in a popup.
// Growth ownership is Winsalot Corp -> Campaign/List -> Agent(s) -> Leads, so
// the owner column is always Winsalot Corp (never a prospect/client).
// Green = open; amber/gray = closed / needs attention. Never red.
export default function GrowthAgentScriptStatusCard({ rows, previewSessions }: { rows: GrowthAgentScriptStatusRowData[]; previewSessions: GrowthScriptSessionPayload[] }) {
  const { openScript } = useGrowthScriptDock();
  const details: ScriptDetailRow[] = rows.map((row) => ({
    key: `${row.agentId}:${row.payload.segmentId}`,
    agentId: row.agentId,
    agentName: row.agentName,
    state: row.state,
    openedAt: row.openedAt,
    lastActivityAt: row.lastActivityAt,
    campaignLabel: row.payload.segmentName,
    owner: GROWTH_CALL_LIST_OWNER,
    campaign: row.payload.segmentName,
    list: null,
    service: row.payload.serviceLabel,
    previewSegmentId: row.payload.segmentId,
  }));

  return (
    <section id="agent-script-status" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] px-4 py-3">
      <GrowthScriptSessionRegister sessions={previewSessions} replace />
      <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-700">Agent Script Status</h2>
      <AgentScriptSummaryList
        details={details}
        ownerHeader="Campaign Owner"
        emptyMessage="No agents are assigned to an active call list."
        onPreview={(row) => openScript(row.previewSegmentId, { previewAgentName: row.agentName })}
      />
    </section>
  );
}
