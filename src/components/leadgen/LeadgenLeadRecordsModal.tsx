"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { Calendar, CircleCheck, Mail, Phone } from "lucide-react";
import { LEADGEN_EMAIL_STATUS_LABELS, LEADGEN_LEAD_STATUS_STYLES, leadgenOverdueDurationLabel, isLeadgenNextFollowUpOverdue } from "@/lib/leadgen-types";
import type { LeadCardRecord } from "@/lib/leadgen-dashboard-records";
import CrmCardModal from "@/components/crm-ui/CrmCardModal";
import type { KpiTone, KpiTrend } from "@/components/crm-ui/KpiCard";

type ActionResult = { error?: string } | void;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function followUpStatusLabel(value: string | null): string {
  if (!value) return "None scheduled";
  const due = new Date(value);
  if (due.getTime() < Date.now()) return `Overdue · ${formatDate(value)}`;
  if (due.toDateString() === new Date().toDateString()) return `Due today · ${formatDate(value)}`;
  return `Scheduled · ${formatDate(value)}`;
}

// The Lead Generation CRM equivalent of the Growth CRM's
// CrmOpportunityRecordsModal - same shared CrmCardModal shell, same
// layout/spacing/actions pattern, just typed to leadgen_leads and wired
// to this CRM's own server actions (addBoardLeadNoteAction,
// completeFollowUpAction, scheduleFollowUpAction) instead of duplicating
// new ones. Reused by every lead-based dashboard stat card (Total Leads,
// Interested Leads, Follow-Ups Due, Overdue Follow-ups) on both the admin
// and agent dashboards - the trigger's `value` is always `records.length`,
// the exact same array rendered below it, so a card's number and its
// modal's rows can never disagree.
export default function LeadgenLeadRecordsModal({
  label,
  tone,
  icon,
  trend,
  records,
  leadHrefBase,
  emptyMessage = "No matching leads.",
  onAddNote,
  onCompleteFollowUp,
  onScheduleFollowUp,
}: {
  label: string;
  tone: KpiTone;
  icon: ReactNode;
  trend?: KpiTrend;
  records: LeadCardRecord[];
  leadHrefBase: string;
  emptyMessage?: string;
  onAddNote: (leadId: string, note: string) => Promise<{ error?: string }>;
  onCompleteFollowUp?: (followUpId: string, leadId: string) => Promise<ActionResult>;
  onScheduleFollowUp?: (leadId: string, formData: FormData) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [rescheduleOpenId, setRescheduleOpenId] = useState<string | null>(null);
  const [completedFollowUpIds, setCompletedFollowUpIds] = useState<Set<string>>(() => new Set());

  function runAction(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result && "error" in result && result.error) setError(result.error);
        else onSuccess?.();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
      }
    });
  }

  return (
    <CrmCardModal
      label={label}
      value={records.length}
      tone={tone}
      icon={icon}
      trend={trend}
      title={label}
      countLabel={`${records.length} matching lead${records.length === 1 ? "" : "s"}`}
    >
      {error && <p className="my-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
      {records.length === 0 ? (
        <div className="py-12 text-center">
          <CircleCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">{emptyMessage}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((record) => {
            const detailHref = `${leadHrefBase}/${record.id}`;
            const overdue = isLeadgenNextFollowUpOverdue(record.next_follow_up_at);

            return (
              <article key={record.id} className="min-w-0 break-words py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{record.business_name}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${LEADGEN_LEAD_STATUS_STYLES[record.status]}`}>
                        {record.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      {record.contact_name ? `${record.contact_name} · ` : ""}
                      {record.phone ?? "—"}
                      {record.email ? ` · ${record.email}` : ""}
                    </p>
                    <p className="mt-1 text-[12.5px] text-slate-500">Agent: {record.agentName}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <span className="flex items-center gap-1 text-slate-400"><Phone className="h-3 w-3" /> Last Contact</span>
                    <div className="font-medium text-slate-700">{record.last_contacted_at ? formatDate(record.last_contacted_at) : "—"}</div>
                    <div className="text-slate-500">{record.last_contacted_at ? record.lastCallOutcome || "Direct contact logged" : "No contact yet"}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <span className="flex items-center gap-1 text-slate-400"><Mail className="h-3 w-3" /> Latest Email Activity</span>
                    <div className="font-medium text-slate-700">
                      {record.lastEmailStatus
                        ? `${LEADGEN_EMAIL_STATUS_LABELS[record.lastEmailStatus]}${record.lastEmailTo ? ` (to ${record.lastEmailTo})` : ""}`
                        : "No email sent yet"}
                    </div>
                    {record.lastEmailAt && <div className="text-slate-500">{formatDate(record.lastEmailAt)}</div>}
                  </div>
                  <div className={`rounded-lg p-2.5 ${overdue ? "bg-rose-50" : "bg-slate-50"}`}>
                    <span className={`flex items-center gap-1 ${overdue ? "text-rose-500" : "text-slate-400"}`}><Calendar className="h-3 w-3" /> Follow-up</span>
                    <div className={`font-medium ${overdue ? "text-rose-700" : "text-slate-700"}`}>
                      {followUpStatusLabel(record.next_follow_up_at)}
                      {overdue && record.next_follow_up_at && (
                        <span className="ml-1 font-normal">({leadgenOverdueDurationLabel(record.next_follow_up_at)})</span>
                      )}
                    </div>
                  </div>
                </div>

                {record.latestNote && (
                  <p className="mt-2 text-[12.5px] text-slate-600">
                    <span className="font-semibold text-slate-700">Latest note:</span> {record.latestNote}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Link href={detailHref} className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11.5px] font-semibold text-sky-700">
                    View Prospect
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setNoteOpenId(noteOpenId === record.id ? null : record.id);
                      setNoteValue("");
                    }}
                    className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700"
                  >
                    Add Note
                  </button>
                  <Link href={detailHref} className="rounded-full border border-slate-300 px-3 py-1 text-[11.5px] font-semibold text-slate-700">
                    Log Call
                  </Link>
                  {record.followUpId && onCompleteFollowUp && (
                    <button
                      type="button"
                      disabled={isPending || completedFollowUpIds.has(record.followUpId)}
                      onClick={() =>
                        runAction(
                          () => onCompleteFollowUp(record.followUpId!, record.id),
                          () => setCompletedFollowUpIds((current) => new Set(current).add(record.followUpId!))
                        )
                      }
                      className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11.5px] font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {completedFollowUpIds.has(record.followUpId) ? "Follow-Up Completed" : "Complete Follow-Up"}
                    </button>
                  )}
                  {onScheduleFollowUp && (
                    <button
                      type="button"
                      onClick={() => setRescheduleOpenId(rescheduleOpenId === record.id ? null : record.id)}
                      className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11.5px] font-semibold text-amber-700"
                    >
                      {record.followUpId ? "Reschedule" : "Schedule Follow-Up"}
                    </button>
                  )}
                  <Link href={detailHref} className="rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-[11.5px] font-semibold text-purple-700">
                    Book Appointment
                  </Link>
                </div>

                {noteOpenId === record.id && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      aria-label={`Add a note for ${record.business_name}`}
                      value={noteValue}
                      onChange={(event) => setNoteValue(event.target.value)}
                      placeholder="Add a short note..."
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
                    />
                    <button
                      type="button"
                      disabled={isPending || !noteValue.trim()}
                      onClick={() =>
                        runAction(
                          () => onAddNote(record.id, noteValue.trim()),
                          () => {
                            setNoteOpenId(null);
                            setNoteValue("");
                          }
                        )
                      }
                      className="rounded-lg bg-sky-700 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    >
                      Save Note
                    </button>
                  </div>
                )}

                {rescheduleOpenId === record.id && onScheduleFollowUp && (
                  <form
                    action={(formData) =>
                      runAction(
                        () => onScheduleFollowUp(record.id, formData),
                        () => setRescheduleOpenId(null)
                      )
                    }
                    className="mt-2 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-end"
                  >
                    <label className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[11.5px] font-semibold text-slate-700">Note</span>
                      <input name="note" placeholder="What happened on the call?" className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11.5px] font-semibold text-slate-700">Follow-up date &amp; time</span>
                      <input type="datetime-local" name="scheduled_at" required className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]" />
                    </label>
                    <button type="submit" disabled={isPending} className="rounded-lg bg-amber-600 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40">
                      Save
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </CrmCardModal>
  );
}
