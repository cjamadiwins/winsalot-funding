"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  SUBCONTRACTOR_STATUSES,
  SUBCONTRACTOR_STATUS_BADGE_CLASSES,
  SUBCONTRACTOR_STATUS_LABELS,
  REFERRAL_PARTNER_MARKET_OPTIONS,
  type SubcontractorProfileRow,
} from "@/lib/crm-subcontractor-types";
import { SUBCONTRACTOR_CURRENCIES, SUBCONTRACTOR_CURRENCY_LABELS, SUBCONTRACTOR_PAY_TYPES, SUBCONTRACTOR_PAY_TYPE_LABELS } from "@/lib/subcontractor-payroll";

type ActionResult = { error?: string };
type PartnerFormKind = "contractor" | "referral_partner";

type Row = {
  subcontractor: SubcontractorProfileRow;
  clientName: string | null;
  agreementSigned: boolean;
  trainingComplete: boolean;
  paymentSetupComplete: boolean;
  crmAccessGranted: boolean;
  crmAccess: string;
  progressSummary: string;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-slate-500";

function Check({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-emerald-600" : "text-slate-400"}>{ok ? "✓" : "—"}</span>;
}

export default function SubcontractorsListClient({
  rows,
  referralPartnerRows,
  clients,
  createSubcontractorAction,
  createReferralPartnerAction,
}: {
  rows: Row[];
  referralPartnerRows: SubcontractorProfileRow[];
  clients: { id: string; company_name: string }[];
  createSubcontractorAction: (formData: FormData) => Promise<ActionResult>;
  createReferralPartnerAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [formKind, setFormKind] = useState<PartnerFormKind>("contractor");

  function runAction(fn: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        setError(result.error);
        return;
      }
      onDone?.();
    });
  }

  return (
    <div className="mt-6">
      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <button type="button" onClick={() => setShowAdd((v) => !v)} className={buttonClasses}>
        {showAdd ? "Cancel" : "+ Add Subcontractor / Referral Partner"}
      </button>

      {showAdd && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
          <div className="flex gap-2">
            {(["contractor", "referral_partner"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setFormKind(kind)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  formKind === kind ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {kind === "contractor" ? "Contractor" : "Subcontractor / Referral Partner"}
              </button>
            ))}
          </div>

          {formKind === "contractor" ? (
            <form
              action={(formData) => runAction(() => createSubcontractorAction(formData), () => setShowAdd(false))}
              className="mt-4 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClasses}>Full Name</label>
                  <input type="text" name="full_name" required className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Email</label>
                  <input type="email" name="email" className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Phone</label>
                  <input type="text" name="phone" className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Business Name (if applicable)</label>
                  <input type="text" name="business_name" className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Country</label>
                  <input type="text" name="country" className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Start Date</label>
                  <input type="date" name="start_date" className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Currency</label>
                  <select name="currency" required defaultValue="USD" className={`${inputClasses} mt-1`}>
                    {SUBCONTRACTOR_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {SUBCONTRACTOR_CURRENCY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Pay Type</label>
                  <select name="pay_type" required defaultValue="fixed" className={`${inputClasses} mt-1`}>
                    {SUBCONTRACTOR_PAY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {SUBCONTRACTOR_PAY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Pay Rate</label>
                  <input type="number" name="pay_rate" min={0} step="0.01" defaultValue={0} className={`${inputClasses} mt-1`} />
                </div>
              </div>
              <div>
                <label className={labelClasses}>Notes</label>
                <textarea name="notes" rows={2} className={`${inputClasses} mt-1`} />
              </div>
              <p className="text-xs text-slate-500">
                A client assignment, the Independent Contractor Agreement, training, and CRM access are completed next,
                from the subcontractor&apos;s detail page.
              </p>
              <button type="submit" disabled={isPending} className={buttonClasses}>
                Add Subcontractor
              </button>
            </form>
          ) : (
            <form
              action={(formData) => runAction(() => createReferralPartnerAction(formData), () => setShowAdd(false))}
              className="mt-4 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClasses}>Full Name</label>
                  <input type="text" name="full_name" required className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Email</label>
                  <input type="email" name="email" className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Phone</label>
                  <input type="text" name="phone" className={`${inputClasses} mt-1`} />
                </div>
                <div>
                  <label className={labelClasses}>Lead Generation Revenue Share %</label>
                  <input
                    type="number"
                    name="lead_gen_revenue_share_percent"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={40}
                    className={`${inputClasses} mt-1`}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Business Lending Commission Share %</label>
                  <input
                    type="number"
                    name="lending_commission_share_percent"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={40}
                    className={`${inputClasses} mt-1`}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Default Currency</label>
                  <select name="currency" required defaultValue="CAD" className={`${inputClasses} mt-1`}>
                    {SUBCONTRACTOR_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {SUBCONTRACTOR_CURRENCY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Status</label>
                  <select name="status" required defaultValue="pending_onboarding" className={`${inputClasses} mt-1`}>
                    {SUBCONTRACTOR_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {SUBCONTRACTOR_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClasses}>Primary Markets</label>
                <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                  {REFERRAL_PARTNER_MARKET_OPTIONS.map((market) => (
                    <label key={market} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" name="primary_markets" value={market} />
                      {market}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClasses}>Notes</label>
                <textarea name="notes" rows={2} className={`${inputClasses} mt-1`} />
              </div>
              <p className="text-xs text-slate-500">
                No onboarding agreement, training, or CRM access applies to a referral partner. Link prospects/clients
                and record referral revenue from this partner&apos;s detail page.
              </p>
              <button type="submit" disabled={isPending} className={buttonClasses}>
                Add Referral Partner
              </button>
            </form>
          )}
        </div>
      )}

      <h2 className="mt-6 text-sm font-bold text-slate-900">Contractors</h2>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Agreement</th>
              <th className="px-4 py-3">Training</th>
              <th className="px-4 py-3">Payment Setup</th>
              <th className="px-4 py-3">CRM Access</th>
              <th className="px-4 py-3">Onboarding</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ subcontractor, clientName, agreementSigned, trainingComplete, paymentSetupComplete, crmAccessGranted, progressSummary }) => (
              <tr key={subcontractor.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{subcontractor.full_name}</td>
                <td className="px-4 py-3 text-slate-600">{clientName ?? "—"}</td>
                <td className="px-4 py-3">
                  <Check ok={agreementSigned} /> {agreementSigned ? "Signed" : "Not signed"}
                </td>
                <td className="px-4 py-3">
                  <Check ok={trainingComplete} /> {trainingComplete ? "Complete" : "Incomplete"}
                </td>
                <td className="px-4 py-3">
                  <Check ok={paymentSetupComplete} /> {subcontractor.currency}
                </td>
                <td className="px-4 py-3">
                  <Check ok={crmAccessGranted} /> {crmAccessGranted ? "Growth CRM" : "No Access"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{progressSummary}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SUBCONTRACTOR_STATUS_BADGE_CLASSES[subcontractor.status]}`}>
                    {SUBCONTRACTOR_STATUS_LABELS[subcontractor.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/crm/subcontractors/${subcontractor.id}`} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  No subcontractors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {clients.length === 0 && (
        <p className="mt-3 text-xs text-amber-700">
          No clients exist yet in Clients - add one there before assigning a subcontractor to a Business/Client.
        </p>
      )}

      <h2 className="mt-8 text-sm font-bold text-slate-900">Subcontractors / Referral Partners</h2>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Primary Markets</th>
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3">Lead Gen Share</th>
              <th className="px-4 py-3">Lending Share</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {referralPartnerRows.map((partner) => (
              <tr key={partner.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{partner.full_name}</td>
                <td className="px-4 py-3 text-slate-600">{partner.primary_markets?.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{partner.currency}</td>
                <td className="px-4 py-3 text-slate-600">
                  {partner.lead_gen_revenue_share_percent !== null ? `${partner.lead_gen_revenue_share_percent}%` : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {partner.lending_commission_share_percent !== null ? `${partner.lending_commission_share_percent}%` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SUBCONTRACTOR_STATUS_BADGE_CLASSES[partner.status]}`}>
                    {SUBCONTRACTOR_STATUS_LABELS[partner.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/crm/subcontractors/${partner.id}`} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}

            {referralPartnerRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No subcontractors / referral partners yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
