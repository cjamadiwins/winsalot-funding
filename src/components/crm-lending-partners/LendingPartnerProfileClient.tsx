"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CrmLendingPartnerRow } from "@/lib/crm-lending-partners-types";
import {
  LENDING_PARTNER_CONTACT_TYPES,
  LENDING_PARTNER_CONTACT_TYPE_LABELS,
  LENDING_PARTNER_CONTACT_TYPE_STYLES,
} from "@/lib/crm-lending-partners-types";
import type { CrmActivityRow } from "@/lib/crm-types";

type ActionResult = { error?: string; partnerId?: string };
type AgentOption = { id: string; full_name: string; email: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

export default function LendingPartnerProfileClient({
  partner,
  activities,
  agents,
  updateAction,
  assignAgentAction,
  logActivityAction,
  archiveAction,
  unarchiveAction,
}: {
  partner: CrmLendingPartnerRow;
  activities: CrmActivityRow[];
  agents: AgentOption[];
  updateAction: (partnerId: string, formData: FormData) => Promise<ActionResult>;
  assignAgentAction: (partnerId: string, formData: FormData) => Promise<ActionResult>;
  logActivityAction: (partnerId: string, formData: FormData) => Promise<ActionResult>;
  archiveAction: (partnerId: string) => Promise<ActionResult>;
  unarchiveAction: (partnerId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSuccess?.();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/crm/lending-partners" className="text-[12.5px] font-medium text-sky-600 hover:text-sky-700">
            &larr; Lending &amp; Referral Partners
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{partner.company_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${LENDING_PARTNER_CONTACT_TYPE_STYLES[partner.contact_type]}`}>
              {LENDING_PARTNER_CONTACT_TYPE_LABELS[partner.contact_type]}
            </span>
            {partner.archived_at && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10.5px] font-semibold text-rose-700">Archived</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          {partner.archived_at ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => unarchiveAction(partner.id))}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (window.confirm(`Archive ${partner.company_name}? Its activity history and HubSpot traceability are preserved.`)) {
                  run(() => archiveAction(partner.id));
                }
              }}
              className="rounded-full border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {editing ? (
        <form
          action={(fd) => run(() => updateAction(partner.id, fd), () => setEditing(false))}
          className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Company Name *</span>
            <input type="text" name="company_name" defaultValue={partner.company_name} required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Contact Name</span>
            <input type="text" name="contact_name" defaultValue={partner.contact_name ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Job Title</span>
            <input type="text" name="job_title" defaultValue={partner.job_title ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Email</span>
            <input type="email" name="email" defaultValue={partner.email ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Phone</span>
            <input type="text" name="phone" defaultValue={partner.phone ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Contact Type *</span>
            <select name="contact_type" required defaultValue={partner.contact_type} className={inputClass}>
              {LENDING_PARTNER_CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LENDING_PARTNER_CONTACT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-[12px] font-medium text-slate-600">Relationship Status</span>
            <input type="text" name="relationship_status" defaultValue={partner.relationship_status ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Submission Email</span>
            <input type="email" name="submission_email" defaultValue={partner.submission_email ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[12px] font-medium text-slate-600">Commission Notes</span>
            <input type="text" name="commission_notes" defaultValue={partner.commission_notes ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-[12px] font-medium text-slate-600">Notes</span>
            <textarea name="notes" rows={4} defaultValue={partner.notes ?? ""} className={inputClass} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={isPending} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Contact Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-muted)]">Contact</dt><dd className="text-right">{partner.contact_name || "-"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-muted)]">Job Title</dt><dd className="text-right">{partner.job_title || "-"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-muted)]">Email</dt><dd className="text-right">{partner.email || "-"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-muted)]">Phone</dt><dd className="text-right">{partner.phone || "-"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-muted)]">Submission Email</dt><dd className="text-right">{partner.submission_email || "-"}</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Relationship</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-muted)]">Status</dt><dd className="text-right">{partner.relationship_status || "-"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-muted)]">Commission Notes</dt><dd className="text-right">{partner.commission_notes || "-"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-muted)]">Created</dt><dd className="text-right">{new Date(partner.created_at).toLocaleDateString()}</dd></div>
            </dl>
            <form
              action={(fd) => run(() => assignAgentAction(partner.id, fd))}
              className="mt-3 flex items-end gap-2 border-t border-[var(--color-border)] pt-3"
            >
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[12px] font-medium text-slate-600">Assigned Agent</span>
                <select name="agent_id" defaultValue={partner.assigned_agent_id ?? ""} className={inputClass}>
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name || a.email}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={isPending} className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Save
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5 sm:col-span-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">HubSpot Source</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-muted)]">HubSpot Record ID</dt>
                <dd className="text-right font-mono text-[12.5px]">{partner.hubspot_record_id?.replace(/^hubspot:/, "") || "Not from HubSpot"}</dd>
              </div>
            </dl>
            {partner.notes && (
              <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                <p className="text-[12px] font-medium text-slate-600">Original HubSpot Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-700">{partner.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity History */}
      <section className="mt-8 mb-8">
        <h2 className="text-base font-bold text-slate-900">Activity History</h2>
        <form
          action={(fd) => run(() => logActivityAction(partner.id, fd), () => {
            const form = document.getElementById("log-activity-form") as HTMLFormElement | null;
            form?.reset();
          })}
          id="log-activity-form"
          className="mt-3 flex gap-2"
        >
          <input type="text" name="notes" placeholder="Log a call, email, or note…" className={`${inputClass} flex-1`} />
          <button type="submit" disabled={isPending} className="rounded-full bg-slate-700 px-4 py-2 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            Log
          </button>
        </form>
        <div className="mt-3 space-y-2">
          {activities.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No activity recorded yet.</p>}
          {activities.map((act) => (
            <div key={act.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--crm-surface)] px-4 py-2.5 text-sm">
              <span className="text-[var(--color-text-muted)]">{new Date(act.occurred_at).toLocaleString()}</span> — {act.notes}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
