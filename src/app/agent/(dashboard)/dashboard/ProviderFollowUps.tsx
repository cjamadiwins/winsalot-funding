"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  PROVIDER_CALL_OUTCOMES,
  PROVIDER_STATUS_STYLES,
  isProviderFollowUpDueToday,
  isProviderFollowUpOverdue,
  isProviderFollowUpUpcoming,
  type ProviderCallOutcome,
  type ProviderFollowUpWithLead,
} from "@/lib/provider-types";
import { toDatetimeLocal } from "@/lib/crm-types";
import {
  addProviderCallNoteAction,
  sendProviderIntakeEmailAction,
} from "../provider-acquisition/actions";
import {
  completeProviderFollowUpAction,
  rescheduleProviderFollowUpAction,
} from "../provider-followup-actions";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]";

// "Provider Follow-ups" - brief section 9. Deliberately its own section on
// the agent dashboard, separate from the crm_leads Follow-Up Calendar, so
// provider recruitment callbacks never mix with customer-lead callbacks.
// Unlike the lead-side calendar (which splits Overdue into its own
// dedicated panel), this section shows Overdue/Today/Upcoming together,
// per the brief's explicit "clear indicators for Due Today, Upcoming,
// Overdue, Completed" - a completed follow-up simply drops out of this
// list once marked done, the same way it does everywhere else in this CRM.
export default function ProviderFollowUps({ followUps }: { followUps: ProviderFollowUpWithLead[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [callNoteId, setCallNoteId] = useState<string | null>(null);
  const [callOutcome, setCallOutcome] = useState<ProviderCallOutcome | "">("");
  const [sendSuccessId, setSendSuccessId] = useState<string | null>(null);

  const overdue = useMemo(() => followUps.filter(isProviderFollowUpOverdue), [followUps]);
  const today = useMemo(() => followUps.filter(isProviderFollowUpDueToday), [followUps]);
  const upcoming = useMemo(() => followUps.filter(isProviderFollowUpUpcoming), [followUps]);

  function runAction(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleSendIntake(followUp: ProviderFollowUpWithLead) {
    const email = followUp.provider_leads?.email;
    if (!email || !followUp.provider_lead_id) return;
    if (!confirm(`Send the provider intake form email to ${email}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await sendProviderIntakeEmailAction(followUp.provider_lead_id);
      if (result.error) setError(result.error);
      else setSendSuccessId(followUp.id);
    });
  }

  if (followUps.length === 0) {
    return (
      <p className="text-[13.5px] text-[var(--color-text-muted)]">
        No provider follow-ups scheduled.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Group
        title="Overdue"
        items={overdue}
        emphasis="danger"
        isPending={isPending}
        reschedulingId={reschedulingId}
        setReschedulingId={setReschedulingId}
        callNoteId={callNoteId}
        setCallNoteId={setCallNoteId}
        callOutcome={callOutcome}
        setCallOutcome={setCallOutcome}
        sendSuccessId={sendSuccessId}
        runAction={runAction}
        onSendIntake={handleSendIntake}
      />
      <Group
        title="Due Today"
        items={today}
        emphasis="warn"
        isPending={isPending}
        reschedulingId={reschedulingId}
        setReschedulingId={setReschedulingId}
        callNoteId={callNoteId}
        setCallNoteId={setCallNoteId}
        callOutcome={callOutcome}
        setCallOutcome={setCallOutcome}
        sendSuccessId={sendSuccessId}
        runAction={runAction}
        onSendIntake={handleSendIntake}
      />
      <Group
        title="Upcoming"
        items={upcoming}
        emphasis="none"
        isPending={isPending}
        reschedulingId={reschedulingId}
        setReschedulingId={setReschedulingId}
        callNoteId={callNoteId}
        setCallNoteId={setCallNoteId}
        callOutcome={callOutcome}
        setCallOutcome={setCallOutcome}
        sendSuccessId={sendSuccessId}
        runAction={runAction}
        onSendIntake={handleSendIntake}
      />
    </div>
  );
}

type Emphasis = "danger" | "warn" | "none";

function Group({
  title,
  items,
  emphasis,
  isPending,
  reschedulingId,
  setReschedulingId,
  callNoteId,
  setCallNoteId,
  callOutcome,
  setCallOutcome,
  sendSuccessId,
  runAction,
  onSendIntake,
}: {
  title: string;
  items: ProviderFollowUpWithLead[];
  emphasis: Emphasis;
  isPending: boolean;
  reschedulingId: string | null;
  setReschedulingId: (v: string | null) => void;
  callNoteId: string | null;
  setCallNoteId: (v: string | null) => void;
  callOutcome: ProviderCallOutcome | "";
  setCallOutcome: (v: ProviderCallOutcome | "") => void;
  sendSuccessId: string | null;
  runAction: (fn: () => Promise<unknown>, onDone?: () => void) => void;
  onSendIntake: (followUp: ProviderFollowUpWithLead) => void;
}) {
  if (items.length === 0) return null;

  const cardStyle =
    emphasis === "danger"
      ? "border-red-200 bg-red-50"
      : emphasis === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-[var(--color-border)] bg-[var(--color-input-bg)]";
  const titleStyle =
    emphasis === "danger" ? "text-red-700" : emphasis === "warn" ? "text-amber-700" : "text-[var(--color-text-muted)]";

  return (
    <div className="mt-5">
      <h3 className={`text-[12px] font-semibold uppercase tracking-wide ${titleStyle}`}>
        {title} ({items.length})
      </h3>
      <div className="mt-2 space-y-2">
        {items.map((followUp) => {
          const provider = followUp.provider_leads;
          return (
            <div key={followUp.id} className={`rounded-xl border p-4 ${cardStyle}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/agent/provider-acquisition/${followUp.provider_lead_id}`}
                  className="font-semibold text-[var(--color-ink-strong)] hover:text-[var(--color-accent)]"
                >
                  {provider?.business_name ?? "Provider"}
                </Link>
                <span className="text-[12.5px] font-medium text-[var(--color-text-muted)]">
                  {new Date(followUp.scheduled_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-0.5 text-[12.5px] text-[var(--color-text-muted)]">
                {provider?.contact_person ? `${provider.contact_person} · ` : ""}
                {provider?.phone}
                {provider?.email ? ` · ${provider.email}` : ""}
              </div>
              {provider?.status && (
                <span
                  className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${PROVIDER_STATUS_STYLES[provider.status]}`}
                >
                  {provider.status}
                </span>
              )}
              {followUp.note && <p className="mt-1.5 text-[13.5px] text-[var(--color-text-body)]">{followUp.note}</p>}

              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    runAction(() => completeProviderFollowUpAction(followUp.id, followUp.provider_lead_id))
                  }
                  className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Mark Completed
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setReschedulingId(reschedulingId === followUp.id ? null : followUp.id)}
                  className="text-[12.5px] font-semibold text-[var(--color-accent)]"
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setCallOutcome("");
                    setCallNoteId(callNoteId === followUp.id ? null : followUp.id);
                  }}
                  className="text-[12.5px] font-semibold text-[var(--color-ink-mute)]"
                >
                  Quick Call Note
                </button>
                <button
                  type="button"
                  disabled={isPending || !provider?.email}
                  onClick={() => onSendIntake(followUp)}
                  className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send Intake Form
                </button>
              </div>
              {sendSuccessId === followUp.id && (
                <p className="mt-2 text-[12.5px] font-medium text-emerald-700">Intake form email sent.</p>
              )}

              {reschedulingId === followUp.id && (
                <form
                  action={(formData) =>
                    runAction(
                      () => rescheduleProviderFollowUpAction(followUp.id, followUp.provider_lead_id, formData),
                      () => setReschedulingId(null)
                    )
                  }
                  className="mt-3 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="datetime-local"
                    name="scheduled_at"
                    required
                    defaultValue={toDatetimeLocal(followUp.scheduled_at)}
                    className={`${inputClass} max-w-[220px]`}
                  />
                  <input name="note" required placeholder="Reason for rescheduling (required)" className={`${inputClass} max-w-[200px]`} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
                  >
                    Save
                  </button>
                </form>
              )}

              {callNoteId === followUp.id && (
                <form
                  action={(formData) =>
                    runAction(
                      async () => {
                        const result = await addProviderCallNoteAction(followUp.provider_lead_id, formData);
                        if (result?.error) throw new Error(result.error);
                      },
                      () => setCallNoteId(null)
                    )
                  }
                  className="mt-3 space-y-2"
                >
                  <select
                    name="call_outcome"
                    required
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value as ProviderCallOutcome)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select a call outcome…
                    </option>
                    {PROVIDER_CALL_OUTCOMES.map((outcome) => (
                      <option key={outcome} value={outcome}>
                        {outcome}
                      </option>
                    ))}
                  </select>
                  <input name="notes" placeholder="Notes (optional)" className={inputClass} />
                  <input type="datetime-local" name="next_follow_up_at" className={inputClass} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
                  >
                    Save Call Note
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
