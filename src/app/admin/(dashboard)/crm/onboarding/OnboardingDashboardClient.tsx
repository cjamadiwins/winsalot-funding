"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  activateCampaignAction,
  archiveAgreementAction,
  updateAgreementInvoiceStatusAction,
} from "../agreements/actions";
import type { OnboardingStage } from "@/lib/crm-agreement-types";

export type OnboardingRow = {
  agreementId: string;
  clientId: string;
  clientName: string;
  contactPerson: string;
  serviceTypeLabel: string;
  monthlyTarget: number;
  monthlyFee: number;
  stage: OnboardingStage;
  nextAction: string;
  agreementStatus: string;
  intakeConfigId: string | null;
  intakeStatus: string;
  invoiceId: string | null;
  invoiceStatusLabel: string;
  paymentReceived: boolean;
  campaignStatus: string;
  canRecordInvoice: boolean;
};

const buttonClasses = "text-xs font-semibold text-sky-600 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50";
const dangerButtonClasses = "text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function OnboardingDashboardClient({ rows }: { rows: OnboardingRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Client</th>
              <th className="px-3 py-3">Contact</th>
              <th className="px-3 py-3">Service Type</th>
              <th className="px-3 py-3">Monthly Target</th>
              <th className="px-3 py-3">Monthly Fee</th>
              <th className="px-3 py-3">Stage</th>
              <th className="px-3 py-3">Intake</th>
              <th className="px-3 py-3">Invoice / Payment</th>
              <th className="px-3 py-3">Campaign</th>
              <th className="px-3 py-3">Next Action</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.agreementId} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-3 py-3 font-medium text-slate-900">{row.clientName}</td>
                <td className="px-3 py-3 text-slate-600">{row.contactPerson}</td>
                <td className="px-3 py-3 text-slate-600">{row.serviceTypeLabel}</td>
                <td className="px-3 py-3 text-slate-600">{row.monthlyTarget}</td>
                <td className="px-3 py-3 text-slate-600">${row.monthlyFee.toLocaleString()}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800">{row.stage}</span>
                </td>
                <td className="px-3 py-3 text-slate-600">{row.intakeStatus}</td>
                <td className="px-3 py-3 text-slate-600">{row.invoiceStatusLabel}</td>
                <td className="px-3 py-3 text-slate-600">{row.campaignStatus}</td>
                <td className="px-3 py-3 text-slate-600">{row.nextAction}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                    <Link href={`/admin/crm/agreements/${row.agreementId}`} className={buttonClasses}>
                      View
                    </Link>
                    {row.intakeConfigId && (
                      <Link href={`/admin/crm/intake/${row.intakeConfigId}`} className={buttonClasses}>
                        Intake
                      </Link>
                    )}
                    {row.canRecordInvoice && (
                      <Link href={`/admin/crm/agreements/${row.agreementId}?recordInvoice=1`} className={buttonClasses}>
                        Record Invoice
                      </Link>
                    )}
                    {row.invoiceId && row.invoiceStatusLabel === "Invoice Sent" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => updateAgreementInvoiceStatusAction(row.invoiceId!, "payment_pending"))}
                        className={buttonClasses}
                      >
                        Mark Payment Pending
                      </button>
                    )}
                    {row.invoiceId && !row.paymentReceived && (row.invoiceStatusLabel === "Invoice Sent" || row.invoiceStatusLabel === "Payment Pending") && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (!confirm(`Mark payment received for ${row.clientName}?`)) return;
                          runAction(() => updateAgreementInvoiceStatusAction(row.invoiceId!, "payment_received"));
                        }}
                        className={buttonClasses}
                      >
                        Mark Payment Received
                      </button>
                    )}
                    {row.paymentReceived && row.campaignStatus !== "Active" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (!confirm(`Activate the campaign for ${row.clientName}?`)) return;
                          runAction(() => activateCampaignAction(row.clientId));
                        }}
                        className={buttonClasses}
                      >
                        Activate Campaign
                      </button>
                    )}
                    {row.agreementStatus !== "archived" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (!confirm(`Archive the agreement for ${row.clientName}? This does not delete any data.`)) return;
                          runAction(() => archiveAgreementAction(row.agreementId));
                        }}
                        className={dangerButtonClasses}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  No clients in onboarding yet. Start from an opportunity or create an agreement from Client Agreements.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
