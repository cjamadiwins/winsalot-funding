// Admin-only display helpers for the Agent Script Status summary (both CRMs).
// Pure: turns the per-campaign status entries the loaders already produce into
// one compact summary per agent. Reads only; never touches tracking or
// notification logic.

import { SCRIPT_DISPLAY, type ScriptDisplayState } from "./leadgen-script-status";

export type ScriptStatusDetail = {
  agentId: string;
  agentName: string;
  state: ScriptDisplayState;
  openedAt: string | null;
  lastActivityAt: string | null;
  // Short campaign/list label used for "Current:" / "Last:" in the summary.
  campaignLabel: string;
};

export type AgentScriptSummary = {
  agentId: string;
  agentName: string;
  state: ScriptDisplayState;
  isOpen: boolean;
  tone: "green" | "amber" | "gray";
  campaignCount: number;
  // "current" when a campaign's script is open right now, otherwise the most
  // recently active campaign ("last"); null when nothing has been active yet.
  focus: { kind: "current" | "last"; label: string } | null;
  lastActivityAt: string | null;
};

// Open beats closed-while-working beats closed beats inactive beats never opened.
const RANK: Record<ScriptDisplayState, number> = { open: 4, closed_working: 3, closed: 2, inactive: 1, never_opened: 0 };

export function summarizeByAgent(details: ScriptStatusDetail[]): AgentScriptSummary[] {
  const byAgent = new Map<string, ScriptStatusDetail[]>();
  for (const d of details) byAgent.set(d.agentId, [...(byAgent.get(d.agentId) ?? []), d]);

  const summaries: AgentScriptSummary[] = [];
  for (const [agentId, list] of byAgent) {
    const state = list.reduce<ScriptDisplayState>((best, d) => (RANK[d.state] > RANK[best] ? d.state : best), "never_opened");
    const byRecent = [...list].sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
    const open = byRecent.find((d) => d.state === "open");
    const recent = byRecent.find((d) => d.lastActivityAt);
    summaries.push({
      agentId,
      agentName: list[0].agentName,
      state,
      isOpen: state === "open",
      tone: SCRIPT_DISPLAY[state].tone,
      campaignCount: list.length,
      focus: open ? { kind: "current", label: open.campaignLabel } : recent ? { kind: "last", label: recent.campaignLabel } : null,
      lastActivityAt: recent?.lastActivityAt ?? null,
    });
  }
  return summaries.sort((a, b) => a.agentName.localeCompare(b.agentName));
}

export function overallScriptLabel(isOpen: boolean): string {
  return isOpen ? "Script Open" : "Script Closed";
}

export function relativeActivityLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
