"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CANACAP_DOCUMENTS,
  CANACAP_STATUSES,
  CANACAP_STATUS_LABELS,
  type CrmCanacapApplicationRow,
} from "@/lib/crm-canacap-types";

type ActionResult = { error?: string };

const APPLICATION_URL = "/admin/crm/lending-partners/canacap/application";
const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";
const cardClass = "rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5";

function ApplicationFields({ app }: { app?: CrmCanacapApplicationRow }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {!app && (
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-slate-600">Client Business Name *</span>
          <input type="text" name="business_name" required className={inputClass} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-slate-600">Business Owner / Director</span>
        <input type="text" name="owner_name" defaultValue={app?.owner_name ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-slate-600">Application Status</span>
        <select name="status" defaultValue={app?.status ?? "not_started"} className={inputClass}>
          {CANACAP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CANACAP_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-slate-600">Date Submitted</span>
        <input type="date" name="date_submitted" defaultValue={app?.date_submitted ?? ""} className={inputClass} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-[12px] font-medium text-slate-600">Supporting Documents Collected</legend>
        <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {CANACAP_DOCUMENTS.map((d) => (
            <label key={d.field} className="flex items-center gap-2 text-[13.5px] text-slate-800">
              <input type="checkbox" name={d.field} defaultChecked={app?.[d.field] ?? false} className="h-4 w-4" />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-[12px] font-medium text-slate-600">Notes</span>
        <textarea name="notes" rows={2} defaultValue={app?.notes ?? ""} className={inputClass} />
      </label>
    </div>
  );
}

export default function CanacapClient({
  applications,
  createAction,
  updateAction,
}: {
  applications: CrmCanacapApplicationRow[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (id: string, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, onSuccess: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSuccess();
    });
  }

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          CanaCap Financing Application
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Original four-page Merchant Cash Advance application. Open it to view or print, or download a copy to send
          to the client.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={APPLICATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            CanaCap Financing Application
          </a>
          <a
            href={APPLICATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View Application
          </a>
          <a
            href={`${APPLICATION_URL}?download=1`}
            className="rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Download Application
          </a>
        </div>
        <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">
          To print, open the application and use the PDF viewer&apos;s print button.
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Required Supporting Documents
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {CANACAP_DOCUMENTS.map((d) => (
            <li key={d.field}>{d.label}</li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Client Applications</h2>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {adding ? "Cancel" : "Add Client Application"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        )}

        {adding && (
          <form
            action={(fd) => run(() => createAction(fd), () => setAdding(false))}
            className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-5"
          >
            <ApplicationFields />
            <button
              type="submit"
              disabled={isPending}
              className="mt-3 rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save Application"}
            </button>
          </form>
        )}

        <div className="mt-3 space-y-3">
          {applications.length === 0 && !adding && (
            <p className="text-sm text-[var(--color-text-muted)]">No CanaCap applications tracked yet.</p>
          )}
          {applications.map((app) => {
            const collected = CANACAP_DOCUMENTS.filter((d) => app[d.field]).length;
            return (
              <div key={app.id} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-slate-900">{app.business_name}</p>
                    <p className="text-sm text-slate-600">{app.owner_name || "Owner / director not set"}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {CANACAP_STATUS_LABELS[app.status]}
                  </span>
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Date Submitted</dt>
                    <dd>{app.date_submitted || "-"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Supporting Documents</dt>
                    <dd>
                      {collected} of {CANACAP_DOCUMENTS.length} collected
                    </dd>
                  </div>
                </dl>
                {editingId === app.id ? (
                  <form
                    action={(fd) => run(() => updateAction(app.id, fd), () => setEditingId(null))}
                    className="mt-3 border-t border-[var(--color-border)] pt-3"
                  >
                    <ApplicationFields app={app} />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="submit"
                        disabled={isPending}
                        className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isPending ? "Saving…" : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingId(app.id)}
                    className="mt-3 text-[13px] font-medium text-sky-600 hover:text-sky-700"
                  >
                    Update status &amp; documents
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
