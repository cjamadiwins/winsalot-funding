"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// How often the CRM checks in with the server while an agent is clocked
// in - frequent enough that the 30/45-minute inactivity thresholds and
// the 20/35-minute break-overdue thresholds are never off by more than
// this, without polling so often it adds meaningful load. Runs on every
// agent-area page (mounted once in the agent layout), not just the
// dashboard, so "meaningful CRM activity" is tracked app-wide.
const POLL_INTERVAL_MS = 30_000;

// "Meaningful CRM activity" = mouse or keyboard interaction, or any
// normal use of the app (opening a lead, saving a call outcome, etc.) -
// the latter necessarily involves a click or keystroke to happen at all,
// so a page-wide interaction listener is already a superset of the full
// bullet list in the brief without instrumenting every individual
// feature. `passive: true` so these never block scrolling/typing.
const INTERACTION_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;

export type AgentActivityRowLike = {
  clock_in: string;
  clock_out: string | null;
  last_activity_at: string;
  idle_since: string | null;
  is_on_call: boolean;
  idle_ack_pending_since: string | null;
  break1_start: string | null;
  break1_end: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  break2_start: string | null;
  break2_end: string | null;
};

export type AcknowledgeIdleInput = { reason: string; explanation?: string };

// Drives the poll loop against whichever CRM's server action is passed
// in - the hook itself has no idea which CRM it's running in, only the
// shared row shape both attendance tables satisfy.
export function useAgentActivityMonitor<T extends AgentActivityRowLike>(params: {
  initialRow: T | null;
  pollAction: (hadInteraction: boolean) => Promise<{ row: T | null; error?: string }>;
  acknowledgeIdleAction: (input: AcknowledgeIdleInput) => Promise<{ row: T | null; error?: string }>;
}) {
  const [row, setRow] = useState<T | null>(params.initialRow);
  const interactedRef = useRef(false);
  const pollActionRef = useRef(params.pollAction);

  // Keeps the ref pointed at the latest pollAction without mutating it
  // during render (a plain assignment in the render body would risk
  // React re-running the render for an unrelated reason and clobbering a
  // ref an in-flight callback still expects) - pollAction is a stable,
  // module-level export in every real caller, so this effect fires once
  // in practice, but it's correct even if a caller ever passes a fresh
  // function identity.
  useEffect(() => {
    pollActionRef.current = params.pollAction;
  }, [params.pollAction]);

  // A fresh page load (e.g. navigating between agent-area pages) always
  // carries its own server-rendered initial row - trust it over whatever
  // this hook's own polling last saw. React's own recommended pattern for
  // "reset state when a prop changes": adjust state during render rather
  // than in an effect (a ref can't be read/written during render, so the
  // "last seen" value has to be state too, even though it's never itself
  // rendered).
  const [lastInitialRow, setLastInitialRow] = useState(params.initialRow);
  if (lastInitialRow !== params.initialRow) {
    setLastInitialRow(params.initialRow);
    setRow(params.initialRow);
  }

  useEffect(() => {
    function markInteraction() {
      interactedRef.current = true;
    }
    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, markInteraction, { passive: true });
    }
    return () => {
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, markInteraction);
      }
    };
  }, []);

  const poll = useCallback(async (forceInteraction: boolean) => {
    const hadInteraction = forceInteraction || interactedRef.current;
    interactedRef.current = false;
    const result = await pollActionRef.current(hadInteraction);
    if (!result.error) setRow(result.row);
  }, []);

  const isClockedIn = row != null;
  useEffect(() => {
    // "Clocked-out agents are not monitored" - no interval at all once
    // there's no open shift to poll against.
    if (!isClockedIn) return;
    const interval = window.setInterval(() => {
      void poll(false);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isClockedIn, poll]);

  // "I'm Still Working" - an immediate, out-of-band poll that always
  // counts as an interaction regardless of what the passive listeners
  // happened to catch, so the button reliably resets the timer even if
  // clicking it is literally the agent's first interaction in 30+ minutes.
  const acknowledgeStillWorking = useCallback(() => {
    void poll(true);
  }, [poll]);

  // The 30-minute idle acknowledgment modal's own submit - unlike every
  // other write here, this is never driven by the interval, only by an
  // explicit form submission, and its result (success or a validation
  // error) needs to reach the caller directly rather than being silently
  // swallowed the way a routine poll's error is.
  const acknowledgeIdleWarning = useCallback(
    async (input: AcknowledgeIdleInput) => {
      const result = await params.acknowledgeIdleAction(input);
      if (!result.error && result.row) setRow(result.row);
      return result;
    },
    [params]
  );

  return { row, acknowledgeStillWorking, acknowledgeIdleWarning };
}
