"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BookOpenCheck, X } from "lucide-react";
import { SCRIPT_HEARTBEAT_INTERVAL_MS } from "@/lib/leadgen-script-status";
import type { GrowthScriptSessionPayload as ScriptSessionPayload } from "@/lib/growth-script-session-types";
import ApprovedScriptPanel from "./ApprovedScriptPanel";

// Persistent, compact side panel for the Approved Call Script. Mounted once in
// each Lead Gen layout, so it survives navigation between leads/pages and the
// agent never has to reopen it per lead. Agents get open/close only; script
// content is read-only here (edited by Admin on the client/list pages).
//
// Tracking (agent layout only) reports just the panel state - script open or
// closed, and whether the agent is on their call list - via `reportAction`.
// No screenshots, keystrokes or other browser activity are captured.

type ReportAction = (input: { segmentId: string; open: boolean; working: boolean }) => Promise<{ ok: boolean }>;

type Ctx = {
  ready: boolean;
  open: boolean;
  sessions: ScriptSessionPayload[];
  workingSegmentId: string | null;
  openScript: (segmentId?: string, opts?: { previewAgentName?: string }) => void;
  closeScript: () => void;
  register: (sessions: ScriptSessionPayload[], opts?: { replace?: boolean; workingSegmentId?: string | null; autoOpen?: boolean }) => void;
  unregisterWorking: (segmentId: string) => void;
};

const GrowthScriptDockContext = createContext<Ctx | null>(null);

export function useGrowthScriptDock(): Ctx {
  const ctx = useContext(GrowthScriptDockContext);
  if (!ctx) throw new Error("useGrowthScriptDock must be used inside GrowthScriptDockProvider");
  return ctx;
}

const OPEN_KEY = "growth-script-open";
const SESSIONS_KEY = "growth-script-sessions";
const dismissedKey = (segmentId: string) => `growth-script-dismissed:${segmentId}`;

// Tiny sessionStorage-backed store (in-memory fallback when storage is
// unavailable) read with useSyncExternalStore, so the restored panel state is
// hydration-safe and survives a reload within the browser session.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
function storeGet(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function storeSet(key: string, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the in-memory copy still works.
  }
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const noopSubscribe = () => () => undefined;

function parseSessions(raw: string | null): ScriptSessionPayload[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScriptSessionPayload[]) : [];
  } catch {
    return [];
  }
}

export default function GrowthScriptDockProvider({
  agentName,
  reportAction,
  children,
}: {
  agentName: string;
  // Present only in the agent layout. Admin previews are never tracked.
  reportAction?: ReportAction;
  children?: ReactNode;
}) {
  const tracking = !!reportAction;
  const sessionsKey = `${SESSIONS_KEY}:${tracking ? "agent" : "admin"}`;
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const open = useSyncExternalStore(subscribe, () => storeGet(OPEN_KEY) === "1", () => false);
  const sessionsRaw = useSyncExternalStore(subscribe, () => storeGet(sessionsKey), () => null);
  const sessions = useMemo(() => parseSessions(sessionsRaw), [sessionsRaw]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [workingSegmentId, setWorkingSegmentId] = useState<string | null>(null);
  const [previewAgentName, setPreviewAgentName] = useState<string | null>(null);

  const register = useCallback<Ctx["register"]>(
    (incoming, opts = {}) => {
      const prev = parseSessions(storeGet(sessionsKey));
      const merged = opts.replace ? incoming : [...prev.filter((p) => !incoming.some((i) => i.segmentId === p.segmentId)), ...incoming];
      const next = JSON.stringify(merged);
      if (next !== storeGet(sessionsKey)) storeSet(sessionsKey, next);
      if (opts.workingSegmentId !== undefined) {
        setWorkingSegmentId(opts.workingSegmentId);
        if (opts.workingSegmentId) {
          setCurrentId(opts.workingSegmentId);
          // First visit to a list in this browser session: make the script
          // immediately accessible. Once the agent closes it, it stays closed.
          if (opts.autoOpen && storeGet(dismissedKey(opts.workingSegmentId)) !== "1") storeSet(OPEN_KEY, "1");
        }
      }
    },
    [sessionsKey]
  );

  const unregisterWorking = useCallback((segmentId: string) => {
    setWorkingSegmentId((prev) => (prev === segmentId ? null : prev));
  }, []);

  const openScript = useCallback<Ctx["openScript"]>((segmentId, opts) => {
    if (segmentId) {
      setCurrentId(segmentId);
      storeSet(dismissedKey(segmentId), null);
    }
    setPreviewAgentName(opts?.previewAgentName ?? null);
    storeSet(OPEN_KEY, "1");
  }, []);

  const current = useMemo(
    () => sessions.find((s) => s.segmentId === currentId) ?? sessions.find((s) => s.segmentId === workingSegmentId) ?? sessions[0] ?? null,
    [sessions, currentId, workingSegmentId]
  );

  // Selector lists every script-bearing list (Growth has few lists per agent).
  const campaignOptions = sessions;

  const closeScript = useCallback(() => {
    storeSet(OPEN_KEY, null);
    if (current) storeSet(dismissedKey(current.segmentId), "1");
  }, [current]);

  // Heartbeat: report panel state on change and once a minute while the script
  // is open or the agent is working their list. A closed panel on a non-list
  // page for a list never reported is left alone (no row is created).
  const reportedRef = useRef<string | null>(null);
  const currentSegmentId = current?.segmentId ?? null;
  const working = !!currentSegmentId && workingSegmentId === currentSegmentId;
  useEffect(() => {
    if (!reportAction || !currentSegmentId || !ready) return;
    const segmentId = currentSegmentId;
    const send = () => {
      if (document.visibilityState === "hidden") return;
      if (!open && !working && reportedRef.current !== segmentId) return;
      reportedRef.current = segmentId;
      void reportAction({ segmentId, open: open && !previewAgentName, working }).catch(() => undefined);
    };
    send();
    const interval = window.setInterval(() => {
      if (open || working) send();
    }, SCRIPT_HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", send);
    };
  }, [reportAction, currentSegmentId, open, working, ready, previewAgentName]);

  const value = useMemo<Ctx>(
    () => ({ ready, open, sessions, workingSegmentId, openScript, closeScript, register, unregisterWorking }),
    [ready, open, sessions, workingSegmentId, openScript, closeScript, register, unregisterWorking]
  );

  const showDock = open && !!current;
  return (
    <GrowthScriptDockContext.Provider value={value}>
      <div className={showDock ? "lg:pr-[392px]" : undefined}>{children}</div>

      {showDock && current && (
        <aside
          aria-label="Approved Call Script"
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col border-l border-slate-200 bg-[var(--crm-surface)] shadow-xl"
        >
          <header className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Approved Call Script{previewAgentName ? " — Preview" : ""}</h3>
              <p className="truncate text-[12px] text-slate-500">
                {current.serviceLabel} · {current.segmentName}
              </p>
            </div>
            <button type="button" onClick={closeScript} aria-label="Close script" className="rounded-full border border-slate-300 p-1 text-slate-500 hover:text-slate-800">
              <X className="h-4 w-4" />
            </button>
          </header>
          {campaignOptions.length > 1 && (
            <div className="border-b border-slate-200 px-3 py-1.5">
              <select
                value={current.segmentId}
                onChange={(e) => setCurrentId(e.target.value)}
                aria-label="Call list"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[12.5px] text-slate-800"
              >
                {campaignOptions.map((s) => (
                  <option key={s.segmentId} value={s.segmentId}>
                    {s.serviceLabel} — {s.segmentName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-3">
            <ApprovedScriptPanel payload={current} agentName={previewAgentName ?? agentName} />
          </div>
        </aside>
      )}

      {tracking && ready && !open && sessions.length > 0 && (
        <button
          type="button"
          onClick={() => openScript(current?.segmentId)}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-sky-700 shadow-lg hover:bg-sky-50"
        >
          <BookOpenCheck className="h-4 w-4" /> Open Script
        </button>
      )}
    </GrowthScriptDockContext.Provider>
  );
}
