"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  activateCampaignAction,
  archiveAgreementAction,
  updateAgreementInvoiceStatusAction,
  activatePilotAction,
  startPilotResultsReviewAction,
  deleteOnboardingRecordAction,
  markOnboardingRecordReviewedAction,
  recordConversionNotificationAction,
} from "../agreements/actions";
import type { AgreementServiceType, AgreementCurrency, CampaignType, ClientManualStatus, PilotType, PaymentStatus, ConversionStatus } from "@/lib/crm-agreement-types";
import ManageOnboardingRecordModal from "./ManageOnboardingRecordModal";
import ManageMenu, { type ManageMenuItem } from "@/components/crm-ui/ManageMenu";
import StatusBadge from "@/components/crm-ui/StatusBadge";

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
  pilotType: PilotType;
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
  isPBF: boolean;
  pilotType: PilotType;
  paymentStatus: PaymentStatus;
  pilotStatus: string;
  conversionStatus: ConversionStatus;
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

export default function OnboardingDashboardClient({ rows }: { rows: OnboardingRow[] }) {
  const router = useRouter();
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

  // Client Onboarding sidebar badge: the specific row was actually opened
  // (View or Edit), not just the dashboard's own list page loading -
  // fire-and-forget, never blocks the navigation/modal it's paired with.
  function markReviewed(row: OnboardingRow) {
    startTransition(() => {
      void markOnboardingRecordReviewedAction(row.agreementId);
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
            {rows.map((row) => {
              const menuItems: ManageMenuItem[] = [
                {
                  key: "view",
                  label: "View",
                  onSelect: () => {
                    markReviewed(row);
                    router.push(`/admin/crm/agreements/${row.agreementId}`);
                  },
                },
                {
                  key: "edit",
                  label: "Edit",
                  disabled: isPending,
                  onSelect: () => {
                    setEditingAgreementId(row.agreementId);
                    markReviewed(row);
                  },
                },
                {
                  key: "intake",
                  label: "Intake",
                  hidden: !row.intakeConfigId,
                  onSelect: () => router.push(`/admin/crm/intake/${row.intakeConfigId}`),
                },
                {
                  key: "record-invoice",
                  label: "Record Invoice",
                  hidden: !row.canRecordInvoice,
                  onSelect: () => router.push(`/admin/crm/agreements/${row.agreementId}?recordInvoice=1`),
                },
                {
                  key: "mark-payment-pending",
                  label: "Mark Payment Pending",
                  hidden: !(!row.isPilot && !row.isPBF && row.invoiceId && row.invoiceStatusLabel === "Invoice Sent"),
                  disabled: isPending,
                  onSelect: () => runAction(() => updateAgreementInvoiceStatusAction(row.invoiceId!, "payment_pending")),
                },
                {
                  key: "mark-payment-received",
                  label: "Mark Payment Received",
                  hidden: !(
                    !row.isPilot &&
                    !row.isPBF &&
                    row.invoiceId &&
                    !row.paymentReceived &&
                    (row.invoiceStatusLabel === "Invoice Sent" || row.invoiceStatusLabel === "Payment Pending")
                  ),
                  disabled: isPending,
                  onSelect: () => {
                    if (!confirm(`Mark payment received for ${row.clientName}?`)) return;
                    runAction(() => updateAgreementInvoiceStatusAction(row.invoiceId!, "payment_received"));
                  },
                },
                {
                  key: "activate-campaign",
                  label: "Activate Campaign",
                  hidden: !(!row.isPilot && !row.isPBF && row.paymentReceived && row.campaignStatus !== "Active"),
                  disabled: isPending,
                  onSelect: () => {
                    if (!confirm(`Activate the campaign for ${row.clientName}?`)) return;
                    runAction(() => activateCampaignAction(row.clientId));
                  },
                },
                {
                  key: "record-conversion",
                  label: "Record Conversion Notification",
                  hidden: !(row.isPBF && row.agreementStatus === "signed" && row.conversionStatus !== "converted"),
                  disabled: isPending,
                  onSelect: () => {
                    if (!confirm(`Record that ${row.clientName} has notified Winsalot Corp of a conversion? The Campaign Fee will become due.`)) return;
                    runAction(() => recordConversionNotificationAction(row.agreementId));
                  },
                },
                {
                  key: "activate-pilot",
                  label: "Activate Pilot",
                  hidden: !(row.isPilot && row.pilotStatus === "not_started" && row.intakeStatus === "Received"),
                  disabled: isPending,
                  onSelect: () => {
                    if (!confirm(`Activate the pilot for ${row.clientName}?`)) return;
                    runAction(() => activatePilotAction(row.agreementId));
                  },
                },
                {
                  key: "start-results-review",
                  label: "Start Results Review",
                  hidden: !(row.isPilot && row.pilotStatus === "active"),
                  disabled: isPending,
                  onSelect: () => runAction(() => startPilotResultsReviewAction(row.agreementId)),
                },
                {
                  key: "review-results",
                  label: "Review Results",
                  hidden: !(row.isPilot && row.pilotStatus === "results_review"),
                  onSelect: () => router.push(`/admin/crm/agreements/${row.agreementId}`),
                },
                {
                  key: "archive",
                  label: "Archive",
                  danger: true,
                  disabled: isPending,
                  hidden: !(
                    !(row.isPilot && (row.pilotStatus === "active" || row.pilotStatus === "results_review")) &&
                    row.agreementStatus !== "archived"
                  ),
                  onSelect: () => {
                    if (!confirm(`Archive the agreement for ${row.clientName}? This does not delete any data.`)) return;
                    runAction(() => archiveAgreementAction(row.agreementId));
                  },
                },
                {
                  key: "delete",
                  label: "Delete",
                  danger: true,
                  disabled: isPending,
                  onSelect: () => handleDelete(row),
                },
              ];

              return (
                <tr key={row.agreementId} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{row.clientName}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.contactPerson}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.campaignTypeLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.serviceTypeLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.monthlyTarget}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {row.isPilot
                      ? row.pilotType === "paid"
                        ? `$${row.monthlyFee.toLocaleString()} (Paid Pilot)`
                        : "$0 (Free Pilot)"
                      : row.isPBF
                        ? `$${row.monthlyFee.toLocaleString()} (Due on Conversion)`
                        : `$${row.monthlyFee.toLocaleString()}`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <StatusBadge label={row.stage} className="bg-indigo-100 text-indigo-800" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.manualStatus ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.intakeStatus}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.invoiceStatusLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.campaignStatus}</td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-600" title={row.nextAction}>
                    {row.nextAction}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ManageMenu items={menuItems} />
                  </td>
                </tr>
              );
            })}

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
