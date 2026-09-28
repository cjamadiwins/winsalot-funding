"use client";

import { Fragment, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LEADGEN_CONVERSION_STATUSES,
  LEADGEN_CONVERSION_STATUS_LABELS,
  LEADGEN_CONVERSION_STATUS_STYLES,
  LEADGEN_ADMIN_VERIFICATION_STATUS_LABELS,
  LEADGEN_ADMIN_VERIFICATION_STATUS_STYLES,
  LEADGEN_CLIENT_REPORTED_RESULT_LABELS,
  suggestedConversionStatusForClientReport,
  type LeadgenConversionRow,
} from "@/lib/leadgen-conversions";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentStatus } from "@/lib/leadgen-types";

export type ConversionListRow = {
  conversion: LeadgenConversionRow;
  businessName: string;
  contactName: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  appointmentStatus: LeadgenAppointmentStatus | null;
  clientName: string;
  campaignName: string | null;
  agentName: string | null;
  updatedByName: string | null;
};

type ActionResult = { error?: string; message?: string };

export type ConversionActions = {
  updateConversionStatus: (conversionId: string, formData: FormData) => Promise<ActionResult>;
  confirmClientReport: (conversionId: string, formData: FormData) => Promise<ActionResult>;
  rejectClientReport: (conversionId: string, formData: FormData) => Promise<ActionResult>;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending Verification" },
  { key: "converted_paid", label: "Converted – Paid" },
  { key: "converted_payment_pending", label: "Converted – Payment Pending" },
  { key: "not_converted", label: "Not Converted" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";
const fieldLabelClass = "block text-[11px] font-semibold uppercase text-slate-500";

// The confirm form only ever offers the post-appointment stages - never
// 'appointment_booked'/'appointment_attended', since a client is
// confirming what happened after the appointment, not the appointment
// itself.
const CONFIRMABLE_STATUSES = LEADGEN_CONVERSION_STATUSES.filter((s) => s !== "appointment_booked" && s !== "appointment_attended");

export default function ConversionsListClient({
  rows,
  actions,
  initialFilter,
}: {
  rows: ConversionListRow[];
  actions: ConversionActions;
  // Pre-selects a filter tab when landing here from the admin dashboard's
  // clickable conversion summary cards - ignored (falls back to "all") if
  // it doesn't match a known filter key, so a stale/tampered URL never
  // crashes this page.
  initialFilter?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const validInitialFilter = FILTERS.some((f) => f.key === initialFilter) ? (initialFilter as FilterKey) : "all";
  const [filter, setFilter] = useState<FilterKey>(validInitialFilter);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [duplicateOverrideId, setDuplicateOverrideId] = useState<string | null>(null);

  const pendingCount = rows.filter((r) => r.conversion.admin_verification_status === "pending_admin_verification").length;

  const visibleRows = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "pending") return rows.filter((r) => r.conversion.admin_verification_status === "pending_admin_verification");
    return rows.filter((r) => r.conversion.conversion_status === filter);
  }, [rows, filter]);

  function runAction(fn: () => Promise<ActionResult>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Saved.");
      setExpandedId(null);
      setDuplicateOverrideId(null);
      router.refresh();
    });
  }

  function handleUpdateSubmit(conversionId: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (duplicateOverrideId === conversionId) formData.set("duplicate_override", "true");
    runAction(() => actions.updateConversionStatus(conversionId, formData));
  }

  function handleConfirmSubmit(conversionId: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (duplicateOverrideId === conversionId) formData.set("duplicate_override", "true");
    runAction(() => actions.confirmClientReport(conversionId, formData));
  }

  function handleReject(conversionId: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    runAction(() => actions.rejectClientReport(conversionId, formData));
  }

  return (
    <div>
      {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13.5px] text-rose-700">{error}</div>}
      {message && !error && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-700">{message}</div>}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setExpandedId(null);
            }}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
              filter === f.key
                ? "border-[var(--crm-accent,#3e7ef7)] bg-[var(--crm-accent,#3e7ef7)] text-white"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
            {f.key === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {visibleRows.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No conversion records match this filter.</p>
        ) : (
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Prospect / Business</th>
                <th className="p-3">Client / Campaign</th>
                <th className="p-3">Agent</th>
                <th className="p-3">Appointment</th>
                <th className="p-3">Conversion Status</th>
                <th className="p-3">Verification</th>
                <th className="p-3">Last Updated</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const c = row.conversion;
                const expanded = expandedId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr className="border-b border-slate-100 align-top">
                      <td className="p-3">
                        <div className="font-semibold text-slate-900">{row.businessName}</div>
                        {row.contactName && <div className="text-[12px] text-slate-500">{row.contactName}</div>}
                      </td>
                      <td className="p-3 text-slate-600">
                        <div>{row.clientName}</div>
                        {row.campaignName && <div className="text-[12px] text-slate-500">{row.campaignName}</div>}
                      </td>
                      <td className="p-3 text-slate-600">{row.agentName ?? "—"}</td>
                      <td className="p-3 text-slate-600">
                        <div>
                          {row.appointmentDate ?? "—"} {row.appointmentTime ?? ""}
                        </div>
                        {row.appointmentStatus && (
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[row.appointmentStatus]}`}>
                            {row.appointmentStatus}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_CONVERSION_STATUS_STYLES[c.conversion_status]}`}>
                          {LEADGEN_CONVERSION_STATUS_LABELS[c.conversion_status]}
                        </span>
                        {c.admin_sale_amount != null && <div className="mt-1 text-[12px] text-slate-500">Sale: ${c.admin_sale_amount.toLocaleString()}</div>}
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_ADMIN_VERIFICATION_STATUS_STYLES[c.admin_verification_status]}`}>
                          {LEADGEN_ADMIN_VERIFICATION_STATUS_LABELS[c.admin_verification_status]}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">
                        <div>{new Date(c.updated_at).toLocaleDateString()}</div>
                        {row.updatedByName && <div className="text-[11.5px]">by {row.updatedByName}</div>}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedId(expanded ? null : c.id);
                            setError(null);
                            setMessage(null);
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {expanded ? "Close" : "Manage"}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <td colSpan={8} className="p-4">
                          {c.admin_verification_status === "pending_admin_verification" && (
                            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                              <h4 className="text-[12.5px] font-bold uppercase tracking-wide text-amber-800">Client-Reported Conversion - Pending Review</h4>
                              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-slate-700 sm:grid-cols-4">
                                <div>
                                  <dt className="text-[11px] uppercase text-slate-500">Result</dt>
                                  <dd>{c.client_reported_result ? LEADGEN_CLIENT_REPORTED_RESULT_LABELS[c.client_reported_result] : "—"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] uppercase text-slate-500">Conversion Date</dt>
                                  <dd>{c.client_reported_conversion_date ?? "—"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] uppercase text-slate-500">Sale Amount</dt>
                                  <dd>{c.client_reported_sale_amount != null ? `$${c.client_reported_sale_amount.toLocaleString()}` : "—"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] uppercase text-slate-500">Confirmation Checked</dt>
                                  <dd>{c.client_confirmation_checked ? "Yes" : "No"}</dd>
                                </div>
                              </dl>
                              {c.client_reported_notes && <p className="mt-2 whitespace-pre-wrap text-[13px] text-slate-700">&ldquo;{c.client_reported_notes}&rdquo;</p>}

                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <form onSubmit={(e) => handleConfirmSubmit(c.id, e)} className="rounded-lg border border-emerald-200 bg-white p-3">
                                  <p className="text-[12.5px] font-semibold text-emerald-800">Confirm Conversion</p>
                                  <label className={`mt-2 ${fieldLabelClass}`}>Confirmed Status</label>
                                  <select
                                    name="conversion_status"
                                    defaultValue={c.client_reported_result ? suggestedConversionStatusForClientReport(c.client_reported_result) : "converted_paid"}
                                    className={inputClass}
                                  >
                                    {CONFIRMABLE_STATUSES.map((s) => (
                                      <option key={s} value={s}>
                                        {LEADGEN_CONVERSION_STATUS_LABELS[s]}
                                      </option>
                                    ))}
                                  </select>
                                  <label className={`mt-2 ${fieldLabelClass}`}>Conversion Date</label>
                                  <input type="date" name="admin_conversion_date" defaultValue={c.client_reported_conversion_date ?? ""} className={inputClass} />
                                  <label className={`mt-2 ${fieldLabelClass}`}>Sale Amount (optional)</label>
                                  <input type="number" step="0.01" min="0" name="admin_sale_amount" defaultValue={c.client_reported_sale_amount ?? ""} className={inputClass} />
                                  <label className={`mt-2 ${fieldLabelClass}`}>Admin Notes</label>
                                  <textarea name="admin_notes" rows={2} defaultValue={c.admin_notes ?? ""} className={inputClass} />
                                  <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-600">
                                    <input
                                      type="checkbox"
                                      checked={duplicateOverrideId === c.id}
                                      onChange={(e) => setDuplicateOverrideId(e.target.checked ? c.id : null)}
                                    />
                                    This is a legitimate separate transaction (override duplicate check)
                                  </label>
                                  <button
                                    type="submit"
                                    disabled={isPending}
                                    className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    Confirm Conversion
                                  </button>
                                </form>

                                <form onSubmit={(e) => handleReject(c.id, e)} className="rounded-lg border border-rose-200 bg-white p-3">
                                  <p className="text-[12.5px] font-semibold text-rose-800">Reject / Needs Clarification</p>
                                  <label className={`mt-2 ${fieldLabelClass}`}>Reason (required)</label>
                                  <textarea
                                    name="rejection_reason"
                                    rows={4}
                                    required
                                    className={inputClass}
                                    placeholder="Explain what needs to be corrected or clarified..."
                                  />
                                  <button
                                    type="submit"
                                    disabled={isPending}
                                    className="mt-3 w-full rounded-lg bg-rose-600 px-3 py-2 text-[13px] font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                                  >
                                    Reject Report
                                  </button>
                                </form>
                              </div>
                            </div>
                          )}

                          <form onSubmit={(e) => handleUpdateSubmit(c.id, e)} className="rounded-lg border border-slate-200 bg-white p-3">
                            <p className="text-[12.5px] font-semibold text-slate-700">Update Conversion Record</p>
                            <div className="mt-2 grid gap-3 sm:grid-cols-4">
                              <div>
                                <label className={fieldLabelClass}>Conversion Status</label>
                                <select name="conversion_status" defaultValue={c.conversion_status} className={inputClass}>
                                  {LEADGEN_CONVERSION_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {LEADGEN_CONVERSION_STATUS_LABELS[s]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={fieldLabelClass}>Conversion Date</label>
                                <input type="date" name="admin_conversion_date" defaultValue={c.admin_conversion_date ?? ""} className={inputClass} />
                              </div>
                              <div>
                                <label className={fieldLabelClass}>Sale Amount</label>
                                <input type="number" step="0.01" min="0" name="admin_sale_amount" defaultValue={c.admin_sale_amount ?? ""} className={inputClass} />
                              </div>
                              <div>
                                <label className="flex items-center gap-2 pt-6 text-[12px] text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={duplicateOverrideId === c.id}
                                    onChange={(e) => setDuplicateOverrideId(e.target.checked ? c.id : null)}
                                  />
                                  Legitimate separate transaction
                                </label>
                              </div>
                            </div>
                            <label className={`mt-2 ${fieldLabelClass}`}>Notes</label>
                            <textarea name="admin_notes" rows={2} defaultValue={c.admin_notes ?? ""} className={inputClass} />
                            <button
                              type="submit"
                              disabled={isPending}
                              className="mt-3 rounded-lg bg-[var(--crm-accent,#3e7ef7)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--crm-accent-hover,#2e63d6)] disabled:opacity-60"
                            >
                              Save
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
