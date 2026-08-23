"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import type { CrmLeaveRequestWithAgent } from "@/lib/crm-types";
import {
  LEAVE_POLICY_BODY,
  LEAVE_POLICY_TITLE,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_STYLES,
  LEAVE_TYPE_LABELS,
  LEAVE_ATTENDANCE_STATUS_LABELS,
  type LeaveStatus,
  type LeaveType,
} from "@/lib/leave-requests";
import { formatDateLong, formatNgn } from "@/lib/payroll";

type ActionResult = { error?: string };

type AgentOption = { id: string; full_name: string; email: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

export default function AdminLeaveRequestsClient({
  agents,
  requests,
  approveAction,
  declineAction,
  markAttendanceAction,
  confirmDeductionAction,
  applyPaidLeaveAction,
  updateAction,
  deleteAction,
  highlightId,
}: {
  agents: AgentOption[];
  requests: CrmLeaveRequestWithAgent[];
  approveAction: (id: string, formData: FormData) => Promise<ActionResult>;
  declineAction: (id: string, formData: FormData) => Promise<ActionResult>;
  markAttendanceAction: (id: string, formData: FormData) => Promise<ActionResult>;
  confirmDeductionAction: (id: string) => Promise<ActionResult>;
  applyPaidLeaveAction: (id: string) => Promise<ActionResult>;
  updateAction: (id: string, formData: FormData) => Promise<ActionResult>;
  deleteAction: (id: string) => Promise<ActionResult>;
  highlightId?: string;
}) {
  const [flashId, setFlashId] = useState(highlightId);

  // Opens the specific request a notification linked to (?highlight=<id>) -
  // scrolls it into view and briefly highlights the row, regardless of
  // any active filter (the row simply won't be there yet if a filter
  // hides it, which is an acceptable edge case for a fresh page load).
  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`leave-request-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timeout = setTimeout(() => setFlashId(undefined), 4000);
    return () => clearTimeout(timeout);
  }, [highlightId]);

  const [agentFilter, setAgentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | LeaveType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | LeaveStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionKind, setDecisionKind] = useState<"approve" | "decline" | null>(null);
  // Which request's inline Edit form is open - separate from `decidingId`
  // (Approve/Decline) so the two panels are never both open for the same
  // row at once.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (agentFilter !== "all" && r.agent_id !== agentFilter) return false;
      if (typeFilter !== "all" && r.leave_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (fromDate && r.end_date < fromDate) return false;
      if (toDate && r.start_date > toDate) return false;
      return true;
    });
  }, [requests, agentFilter, typeFilter, statusFilter, fromDate, toDate]);

  function runAction(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    });
  }

  // "Before saving changes to an approved request, show a confirmation
  // warning" - a plain confirm() naming exactly what's at risk, then a
  // hidden field tells the server this was confirmed (it re-checks this
  // itself too, in case of a stale form or forged request).
  function handleEditSubmit(r: CrmLeaveRequestWithAgent, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (r.status === "approved") {
      const proceed = window.confirm(
        "This leave request is currently Approved. Saving changes may automatically reverse or update its connected attendance and payroll records. Continue?"
      );
      if (!proceed) return;
    }
    const formData = new FormData(e.currentTarget);
    formData.set("confirm_approved_edit", "true");
    runAction(() => updateAction(r.id, formData), () => setEditingId(null));
  }

  // "Delete must always show: 'Are you sure you want to delete this leave
  // request?'" - the exact wording, every time, regardless of status.
  function handleDelete(r: CrmLeaveRequestWithAgent) {
    if (!window.confirm("Are you sure you want to delete this leave request?")) return;
    runAction(() => deleteAction(r.id));
  }

  return (
    <div>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-sky-900">{LEAVE_POLICY_TITLE}</h2>
        <p className="mt-2 text-sm leading-relaxed text-sky-900">{LEAVE_POLICY_BODY}</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Agent</label>
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className={inputClass}>
            <option value="all">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name || a.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | LeaveType)} className={inputClass}>
            <option value="all">All types</option>
            <option value="planned">Planned Leave</option>
            <option value="emergency">Emergency Leave</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | LeaveStatus)} className={inputClass}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[12px] font-medium text-slate-600">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[12px] font-medium text-slate-600">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Notice</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attendance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                  No leave requests match these filters.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const agentName = r.crm_users?.full_name || r.crm_users?.email || "Unknown agent";
              const isDeciding = decidingId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr
                    id={`leave-request-${r.id}`}
                    className={flashId === r.id ? "bg-amber-50 transition-colors" : "transition-colors"}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">{agentName}</td>
                    <td className="px-4 py-3">{LEAVE_TYPE_LABELS[r.leave_type]}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateLong(r.start_date)} – {formatDateLong(r.end_date)}
                    </td>
                    <td className="px-4 py-3">
                      {r.notice_days}d
                      {r.is_short_notice && (
                        <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                          Short Notice
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <span className="line-clamp-2">{r.reason}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${LEAVE_STATUS_STYLES[r.status]}`}>
                        {LEAVE_STATUS_LABELS[r.status]}
                      </span>
                      {r.decision_note && <p className="mt-1 text-xs text-[var(--color-text-muted)]">Note: {r.decision_note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {LEAVE_ATTENDANCE_STATUS_LABELS[r.attendance_status]}
                      </span>
                      {r.deduction_amount !== null && (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          Deduction: {formatNgn(r.deduction_amount)}
                          {r.deduction_confirmed ? (r.payroll_applied_id ? " (applied)" : " (confirmed)") : " (pending review)"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" && (
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setDecidingId(r.id);
                              setDecisionKind("approve");
                              setError(null);
                            }}
                            className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDecidingId(r.id);
                              setDecisionKind("decline");
                              setError(null);
                            }}
                            className="text-[12px] font-semibold text-rose-600 hover:text-rose-700"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {r.status === "approved" && r.attendance_status === "none" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("attendance_status", "paid_leave");
                            runAction(() => markAttendanceAction(r.id, fd));
                          }}
                          className="text-[12px] font-semibold text-sky-600 hover:text-sky-700 disabled:opacity-50"
                        >
                          Mark Paid Leave
                        </button>
                      )}
                      {r.status === "declined" && r.attendance_status === "none" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("attendance_status", "unpaid_absence");
                            runAction(() => markAttendanceAction(r.id, fd));
                          }}
                          className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                        >
                          Mark Unapproved Absence
                        </button>
                      )}
                      {r.attendance_status === "paid_leave" && !r.payroll_applied_id && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => applyPaidLeaveAction(r.id))}
                          className="text-[12px] font-semibold text-sky-600 hover:text-sky-700 disabled:opacity-50"
                        >
                          Apply to Payroll
                        </button>
                      )}
                      {r.attendance_status === "unpaid_absence" && !r.payroll_applied_id && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => confirmDeductionAction(r.id))}
                          className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                        >
                          {r.deduction_confirmed ? "Retry Apply" : "Confirm Deduction"}
                        </button>
                      )}
                      <div className="mt-2 flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setDecidingId(null);
                            setError(null);
                            setEditingId(editingId === r.id ? null : r.id);
                          }}
                          className="text-[12px] font-semibold text-slate-600 hover:text-slate-800"
                        >
                          {editingId === r.id ? "Close" : "Edit"}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleDelete(r)}
                          className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isDeciding && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 px-4 py-4">
                        <form
                          action={(fd) => {
                            const action = decisionKind === "approve" ? approveAction : declineAction;
                            runAction(() => action(r.id, fd), () => setDecidingId(null));
                          }}
                          className="flex flex-wrap items-end gap-3"
                        >
                          <div className="min-w-[240px] flex-1">
                            <label className="mb-1 block text-[12px] font-medium text-slate-600">
                              Decision note (optional)
                            </label>
                            <input type="text" name="decision_note" className={inputClass} />
                          </div>
                          <button
                            type="submit"
                            disabled={isPending}
                            className={`rounded-full px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                              decisionKind === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                            }`}
                          >
                            {decisionKind === "approve" ? "Confirm Approval" : "Confirm Decline"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDecidingId(null)}
                            className="text-[12px] font-semibold text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                  {editingId === r.id && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 px-4 py-4">
                        {r.status === "approved" && (
                          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
                            This request is currently Approved. Saving changes here may automatically reverse or update
                            its connected attendance and payroll records - you&apos;ll be asked to confirm.
                          </p>
                        )}
                        <form onSubmit={(e) => handleEditSubmit(r, e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-slate-600">Leave Type</span>
                            <select name="leave_type" defaultValue={r.leave_type} className={inputClass}>
                              <option value="planned">Planned Leave</option>
                              <option value="emergency">Emergency Leave</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-slate-600">Status</span>
                            <select name="status" defaultValue={r.status} className={inputClass}>
                              <option value="pending">Pending</option>
                              <option value="approved">Approved</option>
                              <option value="declined">Declined</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-slate-600">Start Date</span>
                            <input type="date" name="start_date" required defaultValue={r.start_date} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-slate-600">End Date</span>
                            <input type="date" name="end_date" required defaultValue={r.end_date} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1 sm:col-span-2">
                            <span className="text-[12px] font-medium text-slate-600">Reason</span>
                            <textarea name="reason" required rows={2} defaultValue={r.reason} className={inputClass} />
                          </label>
                          <div className="flex gap-3 sm:col-span-2">
                            <button
                              type="submit"
                              disabled={isPending}
                              className="rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isPending ? "Saving…" : "Save Changes"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-[12px] font-semibold text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
