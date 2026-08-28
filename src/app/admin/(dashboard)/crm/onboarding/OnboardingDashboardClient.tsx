"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  activateCampaignAction,
  archiveAgreementAction,
  updateAgreementInvoiceStatusAction,
  activatePilotAction,
  startPilotResultsReviewAction,
  deleteOnboardingRecordAction,
} from "../agreements/actions";
import type { AgreementServiceType, AgreementCurrency, CampaignType, ClientManualStatus } from "@/lib/crm-agreement-types";
import ManageOnboardingRecordModal from "./ManageOnboardingRecordModal";

// Everything the Manage modal's Edit form needs - kept as its own type so
// the modal (and OnboardingRow below) can't drift out of sync with what
// updateOnboardingRecordAction actually accepts.
export type ManageFields = {
  legalBusinessName: string;
  contactPerson: string;
  businessEmail: string;
  phone: string | null;
  additionalNotes: string | null;
  manualStatus: ClientManualStatus | null;
  serviceType: AgreementServiceType;
  campaignType: CampaignType;
  monthlyTarget: number;
  monthlyFee: number;
  setupFee: number | null;
  currency: AgreementCurrency;
  campaignStartDate: string | null;
  pilotEndDate: string | null;
  isLocked: boolean;
};

export type OnboardingRow = {
  agreementId: string;
  clientId: string;
  clientName: string;
  contactPerson: string;
  campaignTypeLabel: string;
  serviceTypeLabel: string;
  monthlyTarget: number;
  monthlyFee: number;
  // Either an OnboardingStage or a PilotStage label, depending on isPilot -
  // widened to string since one dashboard table renders both pipelines.
  stage: string;
  nextAction: string;
  agreementStatus: string;
  isPilot: boolean;
  pilotStatus: string;
  intakeConfigId: string | null;
  intakeStatus: string;
  invoiceId: string | null;
  invoiceStatusLabel: string;
  paymentReceived: boolean;
  campaignStatus: string;
  canRecordInvoice: boolean;
  manualStatus: ClientManualStatus | null;
  manage: ManageFields;
};

const buttonClasses = "text-xs font-semibold text-sky-600 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50";
const dangerButtonClasses = "text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function OnboardingDashboardClient({ rows }: { rows: OnboardingRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingAgreementId, setEditingAgreementId] = useState<string | null>(null);
  const editingRow = rows.find((r) => r.agreementId === editingAgreementId) ?? null;

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }

  function handleDelete(row: OnboardingRow) {
    if (!confirm("Are you sure you want to delete this client onboarding record? This action cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteOnboardingRecordAction(row.agreementId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.archivedInstead) {
        alert(`"${row.clientName}" has already been signed and cannot be permanently deleted, so it has been archived instead to preserve its history.`);
      }
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
              <th className="px-3 py-3">Campaign Type</th>
              <th className="px-3 py-3">Service Type</th>
              <th className="px-3 py-3">Target</th>
              <th className="px-3 py-3">Monthly Fee</th>
              <th className="px-3 py-3">Stage</th>
              <th className="px-3 py-3">Client Status</th>
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
                <td className="px-3 py-3 text-slate-600">{row.campaignTypeLabel}</td>
                <td className="px-3 py-3 text-slate-600">{row.serviceTypeLabel}</td>
                <td className="px-3 py-3 text-slate-600">{row.monthlyTarget}</td>
                <td className="px-3 py-3 text-slate-600">{row.isPilot ? "$0 (Free Pilot)" : `$${row.monthlyFee.toLocaleString()}`}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800">{row.stage}</span>
                </td>
                <td className="px-3 py-3 text-slate-600">{row.manualStatus ?? "-"}</td>
                <td className="px-3 py-3 text-slate-600">{row.intakeStatus}</td>
                <td className="px-3 py-3 text-slate-600">{row.invoiceStatusLabel}</td>
                <td className="px-3 py-3 text-slate-600">{row.campaignStatus}</td>
                <td className="px-3 py-3 text-slate-600">{row.nextAction}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                    <Link href={`/admin/crm/agreements/${row.agreementId}`} className={buttonClasses}>
                      View
                    </Link>
                    <button type="button" disabled={isPending} onClick={() => setEditingAgreementId(row.agreementId)} className={buttonClasses}>
                      Edit
                    </button>
                    <button type="button" disabled={isPending} onClick={() => handleDelete(row)} className={dangerButtonClasses}>
                      Delete
                    </button>
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
                    {!row.isPilot && row.invoiceId && row.invoiceStatusLabel === "Invoice Sent" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => updateAgreementInvoiceStatusAction(row.invoiceId!, "payment_pending"))}
                        className={buttonClasses}
                      >
                        Mark Payment Pending
                      </button>
                    )}
                    {!row.isPilot && row.invoiceId && !row.paymentReceived && (row.invoiceStatusLabel === "Invoice Sent" || row.invoiceStatusLabel === "Payment Pending") && (
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
                    {!row.isPilot && row.paymentReceived && row.campaignStatus !== "Active" && (
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
                    {row.isPilot && row.pilotStatus === "not_started" && row.intakeStatus === "Received" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (!confirm(`Activate the pilot for ${row.clientName}?`)) return;
                          runAction(() => activatePilotAction(row.agreementId));
                        }}
                        className={buttonClasses}
                      >
                        Activate Pilot
                      </button>
                    )}
                    {row.isPilot && row.pilotStatus === "active" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => startPilotResultsReviewAction(row.agreementId))}
                        className={buttonClasses}
                      >
                        Start Results Review
                      </button>
                    )}
                    {row.isPilot && row.pilotStatus === "results_review" && (
                      <Link href={`/admin/crm/agreements/${row.agreementId}`} className={buttonClasses}>
                        Review Results →
                      </Link>
                    )}
                    {!(row.isPilot && (row.pilotStatus === "active" || row.pilotStatus === "results_review")) && row.agreementStatus !== "archived" && (
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
                <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                  No clients in onboarding yet. Start from an opportunity or create an agreement from Client Agreements.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <ManageOnboardingRecordModal
          agreementId={editingRow.agreementId}
          clientName={editingRow.clientName}
          manage={editingRow.manage}
          onClose={() => setEditingAgreementId(null)}
        />
      )}
    </div>
  );
}
