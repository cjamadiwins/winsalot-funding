"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
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
  // "Next Action" (and any Additional Notes) is deliberately not one of
  // the always-visible columns - it lives behind this per-row toggle
  // instead, the same "secondary details behind a details row" pattern
  // EmailTrackingTable already uses, so the main table stays narrow
  // enough to need no horizontal scrollbar at a normal desktop width.
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  function toggleExpanded(agreementId: string) {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(agreementId)) next.delete(agreementId);
      else next.add(agreementId);
      return next;
    });
  }

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
        <table className="w-full table-fixed border-collapse text-left text-[12.5px]">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[5%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
            <col className="w-[6%]" />
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Client</th>
              <th className="px-2 py-2">Contact</th>
              <th className="px-2 py-2">Campaign Type</th>
              <th className="px-2 py-2">Service Type</th>
              <th className="px-2 py-2">Target</th>
              <th className="px-2 py-2">Monthly Fee</th>
              <th className="px-2 py-2">Stage</th>
              <th className="px-2 py-2">Client Status</th>
              <th className="px-2 py-2">Intake</th>
              <th className="px-2 py-2">Invoice / Payment</th>
              <th className="px-2 py-2">Campaign Status</th>
              <th className="px-2 py-2" />
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

              const isExpanded = expandedRowIds.has(row.agreementId);
              const hasDetails = Boolean(row.nextAction) || Boolean(row.manage.additionalNotes);

              return (
                <Fragment key={row.agreementId}>
                  <tr className="border-b border-slate-100 align-top last:border-0">
                    <td className="break-words px-2 py-2 font-medium text-slate-900">{row.clientName}</td>
                    <td className="break-words px-2 py-2 text-slate-600">{row.contactPerson}</td>
                    <td className="break-words px-2 py-2 text-slate-600">{row.campaignTypeLabel}</td>
                    <td className="break-words px-2 py-2 text-slate-600">{row.serviceTypeLabel}</td>
                    <td className="px-2 py-2 text-slate-600">{row.monthlyTarget}</td>
                    <td className="break-words px-2 py-2 text-slate-600">
                      {row.isPilot
                        ? row.pilotType === "paid"
                          ? `$${row.monthlyFee.toLocaleString()} (Paid Pilot)`
                          : "$0 (Free Pilot)"
                        : row.isPBF
                          ? `$${row.monthlyFee.toLocaleString()} (Due on Conversion)`
                          : `$${row.monthlyFee.toLocaleString()}`}
                    </td>
                    <td className="px-2 py-2">
                      {/* A plain wrapping chip rather than the shared
                          StatusBadge - a pilot/PBF stage label (e.g.
                          "Agreement Signed - Awaiting Conversion") is too
                          long for this column's width, and StatusBadge is
                          shared across other CRM pages this task must not
                          touch, so it always forces whitespace-nowrap. */}
                      <span className="inline-block rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-semibold leading-snug text-indigo-800">
                        {row.stage}
                      </span>
                    </td>
                    <td className="break-words px-2 py-2 text-slate-600">{row.manualStatus ?? "-"}</td>
                    <td className="break-words px-2 py-2 text-slate-600">{row.intakeStatus}</td>
                    <td className="break-words px-2 py-2 text-slate-600">{row.invoiceStatusLabel}</td>
                    <td className="break-words px-2 py-2 text-slate-600">{row.campaignStatus}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasDetails && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(row.agreementId)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Hide details" : "View details"}
                            title={isExpanded ? "Hide details" : "View details"}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-700"
                          >
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        )}
                        <ManageMenu items={menuItems} />
                      </div>
                    </td>
                  </tr>
                  {isExpanded && hasDetails && (
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td colSpan={12} className="px-3 py-3">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                          {row.nextAction && (
                            <div className="min-w-0">
                              <dt className="text-[11px] font-semibold uppercase text-slate-400">Next Action</dt>
                              <dd className="mt-0.5 break-words text-[12.5px] text-slate-700">{row.nextAction}</dd>
                            </div>
                          )}
                          {row.manage.additionalNotes && (
                            <div className="min-w-0">
                              <dt className="text-[11px] font-semibold uppercase text-slate-400">Additional Notes</dt>
                              <dd className="mt-0.5 break-words text-[12.5px] text-slate-700">{row.manage.additionalNotes}</dd>
                            </div>
                          )}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
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
