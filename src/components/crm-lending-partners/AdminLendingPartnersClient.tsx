"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { CrmLendingPartnerRow } from "@/lib/crm-lending-partners-types";
import {
  LENDING_PARTNER_CONTACT_TYPES,
  LENDING_PARTNER_CONTACT_TYPE_LABELS,
  LENDING_PARTNER_CONTACT_TYPE_STYLES,
} from "@/lib/crm-lending-partners-types";

type ActionResult = { error?: string; partnerId?: string };
type AgentOption = { id: string; full_name: string; email: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

export default function AdminLendingPartnersClient({
  partners,
  agents,
  createAction,
  initialFilters,
}: {
  partners: CrmLendingPartnerRow[];
  agents: AgentOption[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  initialFilters: { search: string; type: string; agent: string };
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);

  function runCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowCreate(false);
    });
  }

  const visiblePartners = partners.filter((p) => (showArchived ? true : !p.archived_at));
  const agentNameById = new Map(agents.map((a) => [a.id, a.full_name || a.email]));

  return (
    <div>
      <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Search</label>
          <input
            type="text"
            name="search"
            defaultValue={initialFilters.search}
            placeholder="Company, contact, email, or phone"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Contact Type</label>
          <select name="type" defaultValue={initialFilters.type} className={inputClass}>
            <option value="">All types</option>
            {LENDING_PARTNER_CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {LENDING_PARTNER_CONTACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Assigned Agent</label>
          <select name="agent" defaultValue={initialFilters.agent} className={inputClass}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name || a.email}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
        <div className="sm:col-span-4 flex gap-3">
          <button type="submit" className="rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Apply Filters
          </button>
          <Link href="/admin/crm/lending-partners" className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Clear
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="ml-auto rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {showCreate ? "Close" : "+ New Lending Partner"}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {showCreate && (
        <form
          action={runCreate}
          className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Company Name *</span>
            <input type="text" name="company_name" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Contact Name</span>
            <input type="text" name="contact_name" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Job Title</span>
            <input type="text" name="job_title" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Email</span>
            <input type="email" name="email" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Phone</span>
            <input type="text" name="phone" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Contact Type *</span>
            <select name="contact_type" required defaultValue="lender_contact" className={inputClass}>
              {LENDING_PARTNER_CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LENDING_PARTNER_CONTACT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-[12px] font-medium text-slate-600">Relationship Status</span>
            <input type="text" name="relationship_status" placeholder="e.g. ISO agreement signed, onboarding in progress" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Submission Email</span>
            <input type="email" name="submission_email" placeholder="Where deal files are sent" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[12px] font-medium text-slate-600">Commission Notes</span>
            <input type="text" name="commission_notes" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-[12px] font-medium text-slate-600">Notes</span>
            <textarea name="notes" rows={2} className={inputClass} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={isPending} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {isPending ? "Creating…" : "Create Lending Partner"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Assigned Agent</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {visiblePartners.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                  No lending partners match these filters.
                </td>
              </tr>
            )}
            {visiblePartners.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">
                  <Link href={`/admin/crm/lending-partners/${p.id}`} className="hover:underline">
                    {p.company_name}
                  </Link>
                  {p.archived_at && <div className="text-xs text-rose-600">Archived</div>}
                </td>
                <td className="px-4 py-3">{p.contact_name || "-"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${LENDING_PARTNER_CONTACT_TYPE_STYLES[p.contact_type]}`}>
                    {LENDING_PARTNER_CONTACT_TYPE_LABELS[p.contact_type]}
                  </span>
                </td>
                <td className="px-4 py-3">{p.email || "-"}</td>
                <td className="px-4 py-3">{p.phone || "-"}</td>
                <td className="px-4 py-3">{p.assigned_agent_id ? agentNameById.get(p.assigned_agent_id) ?? "-" : "-"}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/crm/lending-partners/${p.id}`} className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">
                    View / Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
