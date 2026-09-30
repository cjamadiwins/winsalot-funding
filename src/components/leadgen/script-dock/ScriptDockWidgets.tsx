"use client";

import { useEffect } from "react";
import { BookOpenCheck, CheckCircle2 } from "lucide-react";
import type { ScriptSessionPayload } from "@/lib/leadgen-script-session-types";
import { useScriptDock } from "./ScriptDockProvider";

// Mounted by a page to tell the dock which script(s) apply. `workingSegmentId`
// marks the agent as actively working that list while this page is mounted.
export function ScriptSessionRegister({
  sessions,
  workingSegmentId,
  replace,
  autoOpen,
}: {
  sessions: ScriptSessionPayload[];
  workingSegmentId?: string;
  replace?: boolean;
  autoOpen?: boolean;
}) {
  const { register, unregisterWorking } = useScriptDock();
  useEffect(() => {
    register(sessions, { replace, workingSegmentId: workingSegmentId ?? null, autoOpen });
    return () => {
      if (workingSegmentId) unregisterWorking(workingSegmentId);
    };
  }, [sessions, workingSegmentId, replace, autoOpen, register, unregisterWorking]);
  return null;
}

// Persistent (but compact, amber - never red) notice while the agent is on a
// list with the script closed. Never blocks the list.
export function ScriptClosedNotice({ segmentId }: { segmentId: string }) {
  const { ready, open, openScript, workingSegmentId } = useScriptDock();
  if (!ready || open || workingSegmentId !== segmentId) return null;
  return (
    <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
      <p className="text-[13px] font-medium text-amber-900">Approved campaign script is closed. Open the script before continuing calls.</p>
      <button type="button" onClick={() => openScript(segmentId)} className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-amber-700">
        <BookOpenCheck className="h-3.5 w-3.5" /> Open Script
      </button>
    </div>
  );
}

// Presentational half of the dashboard reminder (kept separate so it renders
// and tests without the dock context).
export function ScriptReminderView({ open, sessions: allSessions, onOpen }: { open: boolean; sessions: ScriptSessionPayload[]; onOpen: (segmentId: string) => void }) {
  if (allSessions.length === 0) return null;
  // One button per client (the script is the client's); not one per list.
  const sessions = [...new Map(allSessions.map((s) => [s.clientId, s])).values()];

  if (open) {
    return (
      <div role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-[13px] font-medium text-emerald-900">
        <CheckCircle2 className="h-4 w-4" /> Approved Call Script is open. Keep it open while working your list.
      </div>
    );
  }

  return (
    <section aria-label="Approved Call Script reminder" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <h2 className="text-sm font-bold text-amber-900">Approved Call Script</h2>
      <p className="mt-0.5 text-[13px] text-amber-900">Open your approved campaign script before calling and keep it open while working this list.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sessions.map((s) => (
          <button
            key={s.segmentId}
            type="button"
            onClick={() => onOpen(s.segmentId)}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-amber-700"
          >
            <BookOpenCheck className="h-4 w-4" /> Open Script{sessions.length > 1 ? ` — ${s.clientName}` : ""}
          </button>
        ))}
      </div>
    </section>
  );
}

// Dashboard reminder for agents with an active call list.
export function AgentScriptReminder({ sessions }: { sessions: ScriptSessionPayload[] }) {
  const { ready, open, openScript } = useScriptDock();
  if (!ready) return null;
  return <ScriptReminderView open={open} sessions={sessions} onOpen={(id) => openScript(id)} />;
}
