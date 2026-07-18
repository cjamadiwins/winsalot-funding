"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  isFollowUpDueToday,
  isFollowUpOverdue,
  isFollowUpUpcoming,
  toDatetimeLocal,
  type CrmFollowUpWithLead,
  type CrmLeadRow,
} from "@/lib/crm-types";
import {
  addFollowUpNoteAction,
  completeFollowUpAction,
  rescheduleFollowUpAction,
  scheduleFollowUpAction,
} from "../followup-actions";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]";

export default function FollowUpCalendar({
  followUps,
  leads,
}: {
  followUps: CrmFollowUpWithLead[];
  leads: CrmLeadRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [notingId, setNotingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const overdue = useMemo(() => followUps.filter(isFollowUpOverdue), [followUps]);
  const today = useMemo(() => followUps.filter(isFollowUpDueToday), [followUps]);
  const upcoming = useMemo(() => followUps.filter(isFollowUpUpcoming), [followUps]);

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

  if (leads.length === 0 && followUps.length === 0) {
    return (
      <p className="text-[13.5px] text-[var(--color-text-muted)]">
        Add a lead first to start scheduling callbacks.
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

      <button
        type="button"
        onClick={() => setShowSchedule((v) => !v)}
        className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13.5px] font-semibold text-white transition hover:opacity-90"
      >
        {showSchedule ? "Cancel" : "+ Schedule Callback"}
      </button>

      {showSchedule && (
        <form
          action={(formData) => {
            const leadId = String(formData.get("lead_id") ?? "");
            if (!leadId) {
              setError("Choose a lead.");
              return;
            }
            runAction(
              () => scheduleFollowUpAction(leadId, formData),
              () => setShowSchedule(false)
            );
          }}
          className="mt-3 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4"
        >
          <select name="lead_id" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Select a lead…
            </option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.business_name}
              </option>
            ))}
          </select>
          <input type="datetime-local" name="scheduled_at" required className={inputClass} />
          <input name="note" placeholder="Short note (optional)" className={inputClass} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90"
          >
            Schedule
          </button>
        </form>
      )}

      <CalendarGroup
        title="Overdue"
        items={overdue}
        emphasis="danger"
        isPending={isPending}
        reschedulingId={reschedulingId}
        notingId={notingId}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        setReschedulingId={setReschedulingId}
        setNotingId={setNotingId}
        runAction={runAction}
      />
      <CalendarGroup
        title="Today"
        items={today}
        emphasis="warn"
        isPending={isPending}
        reschedulingId={reschedulingId}
        notingId={notingId}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        setReschedulingId={setReschedulingId}
        setNotingId={setNotingId}
        runAction={runAction}
      />
      <CalendarGroup
        title="Upcoming"
        items={upcoming}
        emphasis="none"
        isPending={isPending}
        reschedulingId={reschedulingId}
        notingId={notingId}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        setReschedulingId={setReschedulingId}
        setNotingId={setNotingId}
        runAction={runAction}
      />

      {followUps.length === 0 && (
        <p className="mt-4 text-[13.5px] text-[var(--color-text-muted)]">
          No callbacks scheduled. Use &ldquo;+ Schedule Callback&rdquo; above to add one.
        </p>
      )}
    </div>
  );
}

type Emphasis = "danger" | "warn" | "none";

function CalendarGroup({
  title,
  items,
  emphasis,
  isPending,
  reschedulingId,
  notingId,
  noteDraft,
  setNoteDraft,
  setReschedulingId,
  setNotingId,
  runAction,
}: {
  title: string;
  items: CrmFollowUpWithLead[];
  emphasis: Emphasis;
  isPending: boolean;
  reschedulingId: string | null;
  notingId: string | null;
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  setReschedulingId: (v: string | null) => void;
  setNotingId: (v: string | null) => void;
  runAction: (fn: () => Promise<unknown>, onDone?: () => void) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-5">
      <h3
        className={`text-[12px] font-semibold uppercase tracking-wide ${
          emphasis === "danger"
            ? "text-red-700"
            : emphasis === "warn"
              ? "text-amber-700"
              : "text-[var(--color-text-muted)]"
        }`}
      >
        {title} ({items.length})
      </h3>
      <div className="mt-2 space-y-2">
        {items.map((followUp) => (
          <div
            key={followUp.id}
            className={`rounded-xl border p-4 ${
              emphasis === "danger"
                ? "border-red-200 bg-red-50"
                : emphasis === "warn"
                  ? "border-amber-200 bg-amber-50"
                  : "border-[var(--color-border)] bg-[var(--color-input-bg)]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/agent/leads/${followUp.lead_id}`}
                className="font-semibold text-[var(--color-ink-strong)] hover:text-[var(--color-accent)]"
              >
                {followUp.crm_leads?.business_name ?? "Lead"}
              </Link>
              <span
                className={`text-[12.5px] font-medium ${emphasis === "danger" ? "text-red-700" : "text-[var(--color-text-muted)]"}`}
              >
                {new Date(followUp.scheduled_at).toLocaleString()}
              </span>
            </div>
            {followUp.crm_leads?.phone && (
              <div className="mt-0.5 text-[12.5px] text-[var(--color-text-muted)]">
                {followUp.crm_leads.phone}
                {followUp.crm_leads.city ? ` · ${followUp.crm_leads.city}` : ""}
              </div>
            )}
            {followUp.note && (
              <p className="mt-1.5 text-[13.5px] text-[var(--color-text-body)]">{followUp.note}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => runAction(() => completeFollowUpAction(followUp.id, followUp.lead_id))}
                className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Mark Completed
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  setReschedulingId(reschedulingId === followUp.id ? null : followUp.id)
                }
                className="text-[12.5px] font-semibold text-[var(--color-accent)]"
              >
                Reschedule
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setNoteDraft("");
                  setNotingId(notingId === followUp.id ? null : followUp.id);
                }}
                className="text-[12.5px] font-semibold text-[var(--color-ink-mute)]"
              >
                Add Note
              </button>
            </div>

            {reschedulingId === followUp.id && (
              <form
                action={(formData) =>
                  runAction(
                    () => rescheduleFollowUpAction(followUp.id, followUp.lead_id, formData),
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
                <input
                  name="note"
                  placeholder="Note (optional)"
                  defaultValue={followUp.note ?? ""}
                  className={`${inputClass} max-w-[200px]`}
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
                >
                  Save
                </button>
              </form>
            )}

            {notingId === followUp.id && (
              <form
                action={() =>
                  runAction(
                    () => addFollowUpNoteAction(followUp.lead_id, noteDraft),
                    () => setNotingId(null)
                  )
                }
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="What happened?"
                  className={`${inputClass} max-w-[280px]`}
                />
                <button
                  type="submit"
                  disabled={isPending || !noteDraft.trim()}
                  className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save Note
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
