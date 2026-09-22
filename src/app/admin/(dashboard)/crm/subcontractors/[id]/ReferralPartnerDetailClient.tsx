"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  SUBCONTRACTOR_STATUSES,
  SUBCONTRACTOR_STATUS_BADGE_CLASSES,
  SUBCONTRACTOR_STATUS_LABELS,
  SUBCONTRACTOR_PARTNER_TYPE_LABELS,
  REFERRAL_PARTNER_MARKET_OPTIONS,
  REFERRAL_PAYMENT_STATUS_LABELS,
  REFERRAL_COMMISSION_STATUS_LABELS,
  LENDING_REFERRAL_STATUS_LABELS,
  LENDING_REFERRAL_STATUS_BADGE_CLASSES,
  PARTNER_OVERVIEW_EMAIL_STATUS_LABELS,
  PARTNER_OVERVIEW_EMAIL_STATUS_BADGE_CLASSES,
  SUBCONTRACTOR_AUDIT_ACTION_LABELS,
  summarizeReferralPartnerFinancials,
  type SubcontractorProfileRow,
  type SubcontractorReferralRevenueRow,
  type SubcontractorLendingReferralRow,
  type SubcontractorAuditLogRow,
} from "@/lib/crm-subcontractor-types";
import { SUBCONTRACTOR_CURRENCIES, SUBCONTRACTOR_CURRENCY_LABELS, formatSubcontractorCurrency } from "@/lib/subcontractor-payroll";

type ActionResult = { error?: string };

type OpportunityOption = { id: string; business_name: string; stage?: string };
type ClientOption = { id: string; company_name: string; status?: string };

type Props = {
  partner: SubcontractorProfileRow;
  linkedOpportunities: OpportunityOption[];
  linkedClients: ClientOption[];
  unlinkedOpportunities: { id: string; business_name: string }[];
  unlinkedClients: { id: string; company_name: string }[];
  revenueRows: SubcontractorReferralRevenueRow[];
  lendingRows: SubcontractorLendingReferralRow[];
  auditLog: SubcontractorAuditLogRow[];
  updateProfileAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  setStatusAction: (subcontractorId: string, status: string, formData: FormData) => Promise<ActionResult>;
  linkOpportunityAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  unlinkOpportunityAction: (opportunityId: string) => Promise<ActionResult>;
  linkClientAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  unlinkClientAction: (clientId: string) => Promise<ActionResult>;
  recordRevenuePeriodAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  recordRevenueCollectedAction: (revenueId: string, formData: FormData) => Promise<ActionResult>;
  markRevenueCommissionPaidAction: (revenueId: string) => Promise<ActionResult>;
  recordLendingReferralAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  recordLendingCommissionReceivedAction: (lendingReferralId: string, formData: FormData) => Promise<ActionResult>;
  markLendingCommissionPaidAction: (lendingReferralId: string) => Promise<ActionResult>;
  saveOverviewEmailDraftAction: (subcontractorId: string, formData: FormData) => Promise<ActionResult>;
  resetOverviewEmailDraftAction: (subcontractorId: string) => Promise<ActionResult>;
  sendOverviewEmailAction: (subcontractorId: string) => Promise<ActionResult>;
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const smallButtonClasses =
  "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-slate-500";

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function ReferralPartnerDetailClient({
  partner,
  linkedOpportunities,
  linkedClients,
  unlinkedOpportunities,
  unlinkedClients,
  revenueRows,
  lendingRows,
  auditLog,
  updateProfileAction,
  setStatusAction,
  linkOpportunityAction,
  unlinkOpportunityAction,
  linkClientAction,
  unlinkClientAction,
  recordRevenuePeriodAction,
  recordRevenueCollectedAction,
  markRevenueCommissionPaidAction,
  recordLendingReferralAction,
  recordLendingCommissionReceivedAction,
  markLendingCommissionPaidAction,
  saveOverviewEmailDraftAction,
  resetOverviewEmailDraftAction,
  sendOverviewEmailAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [draftSubject, setDraftSubject] = useState(partner.partner_overview_email_subject ?? "");
  const [draftBody, setDraftBody] = useState(partner.partner_overview_email_body ?? "");
  const [collectingRevenueId, setCollectingRevenueId] = useState<string | null>(null);
  const [recordingLendingId, setRecordingLendingId] = useState<string | null>(null);

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

  const clientNameById = new Map(linkedClients.map((c) => [c.id, c.company_name]));
  const financials = summarizeReferralPartnerFinancials(revenueRows, lendingRows);
  const activeClientsCount = linkedClients.filter((c) => c.status === "Active").length;
  const referralsCount = linkedOpportunities.length + linkedClients.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/crm/subcontractors" className="text-xs font-semibold text-sky-600 hover:text-sky-700">
            ← All Subcontractors
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{partner.full_name}</h1>
          <p className="mt-1 text-sm text-slate-500">{SUBCONTRACTOR_PARTNER_TYPE_LABELS[partner.partner_type]}</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${SUBCONTRACTOR_STATUS_BADGE_CLASSES[partner.status]}`}>
          {SUBCONTRACTOR_STATUS_LABELS[partner.status]}
        </span>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <Section title="Profile">
        {editingProfile ? (
          <form
            action={(formData) => runAction(() => updateProfileAction(partner.id, formData), () => setEditingProfile(false))}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClasses}>Full Name</label>
                <input type="text" name="full_name" required defaultValue={partner.full_name} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Email</label>
                <input type="email" name="email" defaultValue={partner.email ?? ""} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Phone</label>
                <input type="text" name="phone" defaultValue={partner.phone ?? ""} className={`${inputClasses} mt-1`} />
              </div>
              <div>
                <label className={labelClasses}>Lead Generation Revenue Share %</label>
                <input
                  type="number"
                  name="lead_gen_revenue_share_percent"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={partner.lead_gen_revenue_share_percent ?? 40}
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
                  defaultValue={partner.lending_commission_share_percent ?? 40}
                  className={`${inputClasses} mt-1`}
                />
              </div>
              <div>
                <label className={labelClasses}>Default Currency</label>
                <select name="currency" required defaultValue={partner.currency} className={`${inputClasses} mt-1`}>
                  {SUBCONTRACTOR_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {SUBCONTRACTOR_CURRENCY_LABELS[c]}
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
                    <input type="checkbox" name="primary_markets" value={market} defaultChecked={partner.primary_markets?.includes(market)} />
                    {market}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClasses}>Notes</label>
              <textarea name="notes" rows={2} defaultValue={partner.notes ?? ""} className={`${inputClasses} mt-1`} />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={isPending} className={buttonClasses}>
                Save Changes
              </button>
              <button type="button" onClick={() => setEditingProfile(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="font-medium text-slate-800">{partner.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="font-medium text-slate-800">{partner.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Date Added</dt>
                <dd className="font-medium text-slate-800">{new Date(partner.created_at).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Default Currency</dt>
                <dd className="font-medium text-slate-800">{SUBCONTRACTOR_CURRENCY_LABELS[partner.currency]}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Primary Markets</dt>
                <dd className="font-medium text-slate-800">{partner.primary_markets?.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Lead Generation Revenue Share</dt>
                <dd className="font-medium text-slate-800">
                  {partner.lead_gen_revenue_share_percent !== null ? `${partner.lead_gen_revenue_share_percent}%` : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Business Lending Commission Share</dt>
                <dd className="font-medium text-slate-800">
                  {partner.lending_commission_share_percent !== null ? `${partner.lending_commission_share_percent}%` : "Not set"}
                </dd>
              </div>
            </dl>
            {partner.notes && <p className="text-slate-500">{partner.notes}</p>}
            <button type="button" onClick={() => setEditingProfile(true)} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
              Edit Partner
            </button>
          </div>
        )}
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap items-center gap-3">
          {SUBCONTRACTOR_STATUSES.filter((s) => s !== partner.status).map((status) => (
            <form key={status} action={(formData) => runAction(() => setStatusAction(partner.id, status, formData))} className="flex items-center gap-2">
              {(status === "inactive" || status === "suspended" || status === "terminated") && (
                <input type="text" name="reason" placeholder="Reason" className="rounded border border-slate-300 px-2 py-1 text-xs" />
              )}
              <button type="submit" disabled={isPending} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                Set {SUBCONTRACTOR_STATUS_LABELS[status]}
              </button>
            </form>
          ))}
        </div>
      </Section>

      <Section title="Summary">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Referrals" value={String(referralsCount)} />
          <Stat label="Active Clients" value={String(activeClientsCount)} />
          <Stat label="Monthly Recurring Revenue" value={formatSubcontractorCurrency(financials.monthlyRecurringRevenue, partner.currency)} />
          <Stat label="Total Revenue Generated" value={formatSubcontractorCurrency(financials.totalRevenueGenerated, partner.currency)} />
          <Stat label="Partner Commission / Revenue Share" value={formatSubcontractorCurrency(financials.partnerShareTotal, partner.currency)} />
          <Stat label="Winsalot Share" value={formatSubcontractorCurrency(financials.winsalotShareTotal, partner.currency)} />
        </div>
      </Section>

      <Section title="Referrals">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={labelClasses}>Prospects</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {linkedOpportunities.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
                  <span className="text-slate-700">
                    {o.business_name} <span className="text-xs text-slate-400">· {o.stage}</span>
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runAction(() => unlinkOpportunityAction(o.id))}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Unlink
                  </button>
                </li>
              ))}
              {linkedOpportunities.length === 0 && <li className="text-slate-500">No prospects linked yet.</li>}
            </ul>
            <form action={(formData) => runAction(() => linkOpportunityAction(partner.id, formData))} className="mt-3 flex flex-wrap gap-2">
              <select name="opportunity_id" required defaultValue="" className={`${inputClasses} max-w-xs`}>
                <option value="" disabled>
                  Link a prospect…
                </option>
                {unlinkedOpportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.business_name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={isPending} className={smallButtonClasses}>
                Link Prospect
              </button>
            </form>
          </div>

          <div>
            <p className={labelClasses}>Clients</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {linkedClients.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
                  <span className="text-slate-700">
                    {c.company_name} <span className="text-xs text-slate-400">· {c.status}</span>
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runAction(() => unlinkClientAction(c.id))}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Unlink
                  </button>
                </li>
              ))}
              {linkedClients.length === 0 && <li className="text-slate-500">No clients linked yet.</li>}
            </ul>
            <form action={(formData) => runAction(() => linkClientAction(partner.id, formData))} className="mt-3 flex flex-wrap gap-2">
              <select name="client_id" required defaultValue="" className={`${inputClasses} max-w-xs`}>
                <option value="" disabled>
                  Link a client…
                </option>
                {unlinkedClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={isPending} className={smallButtonClasses}>
                Link Client
              </button>
            </form>
          </div>
        </div>
      </Section>

      <Section title="Lead Generation Recurring Revenue Share">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Monthly Amount</th>
                <th className="py-2 pr-3">Collected</th>
                <th className="py-2 pr-3">Partner Share</th>
                <th className="py-2 pr-3">Winsalot Share</th>
                <th className="py-2 pr-3">Payment</th>
                <th className="py-2 pr-3">Commission</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {revenueRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-800">{clientNameById.get(row.client_id) ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">
                    {row.period_start} → {row.period_end}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{formatSubcontractorCurrency(row.monthly_amount, row.currency_snapshot)}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatSubcontractorCurrency(row.amount_collected, row.currency_snapshot)}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-800">{formatSubcontractorCurrency(row.partner_share, row.currency_snapshot)}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatSubcontractorCurrency(row.winsalot_share, row.currency_snapshot)}</td>
                  <td className="py-2 pr-3 text-slate-600">{REFERRAL_PAYMENT_STATUS_LABELS[row.payment_status]}</td>
                  <td className="py-2 pr-3 text-slate-600">{REFERRAL_COMMISSION_STATUS_LABELS[row.commission_status]}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col items-start gap-1">
                      {row.payment_status !== "paid" &&
                        (collectingRevenueId === row.id ? (
                          <form
                            action={(formData) =>
                              runAction(() => recordRevenueCollectedAction(row.id, formData), () => setCollectingRevenueId(null))
                            }
                            className="flex flex-wrap items-center gap-1"
                          >
                            <input type="number" name="amount_collected" min={0} step="0.01" defaultValue={row.amount_collected} className="w-24 rounded border border-slate-300 px-1.5 py-1" />
                            <input type="date" name="payment_date" defaultValue={row.payment_date ?? ""} className="rounded border border-slate-300 px-1.5 py-1" />
                            <button type="submit" disabled={isPending} className="font-semibold text-sky-600 hover:text-sky-700">
                              Save
                            </button>
                            <button type="button" onClick={() => setCollectingRevenueId(null)} className="text-slate-500 hover:text-slate-700">
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <button type="button" onClick={() => setCollectingRevenueId(row.id)} className="font-semibold text-sky-600 hover:text-sky-700">
                            Record Revenue Received
                          </button>
                        ))}
                      {row.commission_status === "due" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => markRevenueCommissionPaidAction(row.id))}
                          className="font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          Record Commission Paid
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {revenueRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-slate-500">
                    No revenue periods recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form action={(formData) => runAction(() => recordRevenuePeriodAction(partner.id, formData))} className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3 lg:grid-cols-6">
          <select name="client_id" required defaultValue="" className={inputClasses}>
            <option value="" disabled>
              Client…
            </option>
            {linkedClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
          <input type="date" name="period_start" required className={inputClasses} title="Period start" />
          <input type="date" name="period_end" required className={inputClasses} title="Period end" />
          <input type="number" name="monthly_amount" min={0} step="0.01" required placeholder="Monthly amount" className={inputClasses} />
          <input type="number" name="amount_collected" min={0} step="0.01" placeholder="Amount collected" className={inputClasses} />
          <input type="date" name="payment_date" className={inputClasses} title="Payment date" />
          <div className="sm:col-span-3 lg:col-span-6">
            <button type="submit" disabled={isPending} className={buttonClasses}>
              Record Period
            </button>
          </div>
        </form>
      </Section>

      <Section title="Business Lending Commission Share">
        <div className="mb-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p>Funding approval is subject to lender underwriting.</p>
          <p>Commission percentages paid by lenders may vary.</p>
          <p>Any applicable lender clawback, reversal, cancellation, deduction, or adjustment must be accounted for before the final commission distribution.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Business</th>
                <th className="py-2 pr-3">Funded</th>
                <th className="py-2 pr-3">Commission Received</th>
                <th className="py-2 pr-3">Clawback</th>
                <th className="py-2 pr-3">Partner Share</th>
                <th className="py-2 pr-3">Winsalot Share</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {lendingRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-800">{row.business_name}</td>
                  <td className="py-2 pr-3 text-slate-600">{row.funded_at ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatSubcontractorCurrency(row.lender_commission_received, row.currency_snapshot)}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatSubcontractorCurrency(row.clawback_adjustment, row.currency_snapshot)}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-800">{formatSubcontractorCurrency(row.partner_share, row.currency_snapshot)}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatSubcontractorCurrency(row.winsalot_share, row.currency_snapshot)}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${LENDING_REFERRAL_STATUS_BADGE_CLASSES[row.commission_status]}`}>
                      {LENDING_REFERRAL_STATUS_LABELS[row.commission_status]}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col items-start gap-1">
                      {row.commission_status !== "paid_to_partner" &&
                        (recordingLendingId === row.id ? (
                          <form
                            action={(formData) =>
                              runAction(() => recordLendingCommissionReceivedAction(row.id, formData), () => setRecordingLendingId(null))
                            }
                            className="flex flex-wrap items-center gap-1"
                          >
                            <input
                              type="number"
                              name="lender_commission_received"
                              min={0}
                              step="0.01"
                              defaultValue={row.lender_commission_received}
                              className="w-24 rounded border border-slate-300 px-1.5 py-1"
                            />
                            <input type="number" name="clawback_adjustment" min={0} step="0.01" defaultValue={row.clawback_adjustment} className="w-20 rounded border border-slate-300 px-1.5 py-1" />
                            <button type="submit" disabled={isPending} className="font-semibold text-sky-600 hover:text-sky-700">
                              Save
                            </button>
                            <button type="button" onClick={() => setRecordingLendingId(null)} className="text-slate-500 hover:text-slate-700">
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <button type="button" onClick={() => setRecordingLendingId(row.id)} className="font-semibold text-sky-600 hover:text-sky-700">
                            Record Revenue Received
                          </button>
                        ))}
                      {row.commission_status === "commission_received" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => markLendingCommissionPaidAction(row.id))}
                          className="font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          Record Commission Paid
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {lendingRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-slate-500">
                    No lending deals recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form action={(formData) => runAction(() => recordLendingReferralAction(partner.id, formData))} className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3 lg:grid-cols-5">
          <input type="text" name="business_name" required placeholder="Business name" className={inputClasses} />
          <select name="opportunity_id" defaultValue="" className={inputClasses}>
            <option value="">No linked opportunity</option>
            {linkedOpportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.business_name}
              </option>
            ))}
          </select>
          <input type="date" name="funded_at" className={inputClasses} title="Funded date" />
          <input type="number" name="lender_commission_received" min={0} step="0.01" placeholder="Commission received" className={inputClasses} />
          <input type="number" name="clawback_adjustment" min={0} step="0.01" placeholder="Clawback adjustment" className={inputClasses} />
          <div className="sm:col-span-3 lg:col-span-5">
            <button type="submit" disabled={isPending} className={buttonClasses}>
              Record Funded Deal
            </button>
          </div>
        </form>
      </Section>

      <Section title="Internal Note (Admin Only — Not Included in Partner Overview Email)">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            {partner.full_name} receives {partner.lead_gen_revenue_share_percent ?? 40}%; Winsalot Corp. retains{" "}
            {100 - (partner.lead_gen_revenue_share_percent ?? 40)}% on Lead Generation referrals.
          </li>
          <li>Lead Generation = recurring revenue share while the referred client remains active and paying.</li>
          <li>
            Business Lending = {partner.lending_commission_share_percent ?? 40}% of the net lender commission actually received by
            Winsalot Corp.
          </li>
          <li>Do not promise U.S. financing until Admin confirms an approved U.S. lender relationship.</li>
          <li>Do not calculate commissions against unpaid client invoices.</li>
          <li>Compensation changes require Admin authorization.</li>
        </ul>
      </Section>

      <Section
        title="Send Partner Overview Email"
        right={
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${PARTNER_OVERVIEW_EMAIL_STATUS_BADGE_CLASSES[partner.partner_overview_email_status]}`}>
            {PARTNER_OVERVIEW_EMAIL_STATUS_LABELS[partner.partner_overview_email_status]}
          </span>
        }
      >
        {partner.partner_overview_email_status === "sent" && partner.partner_overview_email_sent_at && (
          <p className="mb-3 text-[12.5px] font-medium text-emerald-700">Sent {new Date(partner.partner_overview_email_sent_at).toLocaleString()}</p>
        )}
        {partner.partner_overview_email_error && (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{partner.partner_overview_email_error}</p>
        )}
        {!partner.email && (
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
            Add an email address above before sending.
          </p>
        )}

        {editingEmail ? (
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClasses}>Subject</span>
              <input type="text" value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} className={inputClasses} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClasses}>Body</span>
              <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} className={`${inputClasses} min-h-[220px] resize-y font-sans`} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const formData = new FormData();
                  formData.set("subject", draftSubject);
                  formData.set("body", draftBody);
                  runAction(() => saveOverviewEmailDraftAction(partner.id, formData), () => setEditingEmail(false));
                }}
                className={buttonClasses}
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setDraftSubject(partner.partner_overview_email_subject ?? "");
                  setDraftBody(partner.partner_overview_email_body ?? "");
                  setEditingEmail(false);
                }}
                className={smallButtonClasses}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <span className={labelClasses}>Recipient Email</span>
              <p className="mt-0.5 text-[13.5px] font-medium text-slate-800">{partner.email ?? "—"}</p>
            </div>
            <div>
              <span className={labelClasses}>Subject</span>
              <p className="mt-0.5 text-[13.5px] font-semibold text-slate-900">{partner.partner_overview_email_subject ?? "—"}</p>
            </div>
            <div>
              <span className={labelClasses}>Body / Preview</span>
              <pre className="mt-0.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 font-sans text-[12.5px] leading-relaxed text-slate-700">
                {partner.partner_overview_email_body ?? "No draft generated yet."}
              </pre>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setDraftSubject(partner.partner_overview_email_subject ?? "");
                  setDraftBody(partner.partner_overview_email_body ?? "");
                  setEditingEmail(true);
                }}
                className={smallButtonClasses}
              >
                Edit Email
              </button>
              <button type="button" disabled={isPending} onClick={() => runAction(() => resetOverviewEmailDraftAction(partner.id))} className={smallButtonClasses}>
                Reset to Default
              </button>
              {partner.email && partner.partner_overview_email_status !== "sent" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => runAction(() => sendOverviewEmailAction(partner.id))}
                  className="rounded-full border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {partner.partner_overview_email_status === "failed" ? "Retry Send Email" : "Send Email"}
                </button>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section title="Audit Log">
        {auditLog.length === 0 ? (
          <p className="text-sm text-slate-500">No audit history yet.</p>
        ) : (
          <ul className="space-y-2 text-xs text-slate-600">
            {auditLog.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <p className="font-semibold text-slate-800">
                  {SUBCONTRACTOR_AUDIT_ACTION_LABELS[entry.action]}{" "}
                  <span className="font-normal text-slate-400">
                    · {entry.performed_by_name} · {new Date(entry.created_at).toLocaleString()}
                  </span>
                </p>
                {entry.reason && <p className="mt-1">Reason: {entry.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
