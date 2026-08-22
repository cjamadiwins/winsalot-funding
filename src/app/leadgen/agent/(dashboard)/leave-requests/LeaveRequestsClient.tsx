"use client";

import { useMemo, useState, useTransition } from "react";
import type { LeadgenLeaveRequestRow } from "@/lib/leadgen-types";
import {
  LEAVE_POLICY_BODY,
  LEAVE_POLICY_TITLE,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_STYLES,
  LEAVE_TYPE_LABELS,
  computeNoticeDays,
  isShortNotice,
} from "@/lib/leave-requests";
import { formatDateLong } from "@/lib/payroll";
import { submitLeadgenLeaveRequestAction } from "./actions";

// Mirrors src/app/agent/(dashboard)/leave-requests/LeaveRequestsClient.tsx
// exactly - see that file for design rationale.
const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export default function LeadgenLeaveRequestsClient({ requests }: { requests: LeadgenLeaveRequestRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [leaveType, setLeaveType] = useState<"planned" | "emergency">("planned");
  const [startDate, setStartDate] = useState("");
  const [formKey, setFormKey] = useState(0);

  const liveShortNoticeWarning = useMemo(() => {
    if (leaveType !== "planned" || !startDate) return false;
    const noticeDays = computeNoticeDays(new Date().toISOString(), startDate);
    return isShortNotice("planned", noticeDays);
  }, [leaveType, startDate]);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await submitLeadgenLeaveRequestAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(
        liveShortNoticeWarning
          ? "Leave request submitted and flagged as Short Notice for the admin."
          : "Leave request submitted."
      );
      setStartDate("");
      setFormKey((k) => k + 1);
    });
  }

  return (
    <div>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-sky-900">{LEAVE_POLICY_TITLE}</h2>
        <p className="mt-2 text-sm leading-relaxed text-sky-900">{LEAVE_POLICY_BODY}</p>
      </div>

      <form key={formKey} action={handleSubmit} className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-900">Submit a Leave Request</h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-slate-600">Leave Type</label>
            <select
              name="leave_type"
              required
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as "planned" | "emergency")}
              className={inputClass}
            >
              <option value="planned">Planned Leave</option>
              <option value="emergency">Emergency Leave</option>
            </select>
          </div>
          <div />
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-slate-600">Start Date</label>
            <input
              type="date"
              name="start_date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-slate-600">End Date</label>
            <input type="date" name="end_date" required min={startDate || undefined} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[12.5px] font-medium text-slate-600">Reason</label>
            <textarea name="reason" required rows={3} className={inputClass} placeholder="Briefly explain the reason for this leave" />
          </div>
        </div>

        {liveShortNoticeWarning && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This is fewer than seven days&apos; notice for Planned Leave. You can still submit — it will be flagged as
            Short Notice for the admin.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        )}
        {success && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-5 rounded-full bg-sky-600 px-6 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Submitting..." : "Submit Request"}
        </button>
      </form>

      <div className="mt-8">
        <h3 className="text-base font-semibold text-slate-900">My Leave Requests</h3>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
          <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {requests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                    No leave requests yet.
                  </td>
                </tr>
              )}
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{new Date(r.submitted_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{LEAVE_TYPE_LABELS[r.leave_type]}</td>
                  <td className="px-4 py-3">
                    {formatDateLong(r.start_date)} – {formatDateLong(r.end_date)}
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <span className="line-clamp-2">{r.reason}</span>
                    {r.is_short_notice && (
                      <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                        Short Notice
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${LEAVE_STATUS_STYLES[r.status]}`}>
                      {LEAVE_STATUS_LABELS[r.status]}
                    </span>
                    {r.decision_note && (
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">Note: {r.decision_note}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
