"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDraftAgreementAction, archiveAgreementAction, createNewAgreementVersionAction } from "./actions";
import { CAMPAIGN_TYPE_LABELS, type CrmClientAgreementRow } from "@/lib/crm-agreement-types";
import ConfirmDeleteModal from "@/components/crm-invoices/ConfirmDeleteModal";

const actionLinkClass = "text-xs font-semibold text-sky-600 hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:text-slate-300";

// Admin-only View/Edit/Delete actions for the Client Agreements list
// (this page is already gated by requireCrmAdmin() server-side in
// page.tsx and is never linked from any agent-facing nav, so no separate
// role check is needed here - see that page for the gate).
//
//   - Draft: Edit opens the existing in-place draft editor on the
//     agreement detail page (unchanged); Delete permanently removes it,
//     behind ConfirmDeleteModal's typed "DELETE" confirmation.
//   - Sent / Signed: Edit creates a brand-new draft version instead of
//     touching the finalized record (createNewAgreementVersionAction);
//     Delete never deletes a finalized agreement - it archives it instead
//     (archiveAgreementAction), behind a plain confirm() naming exactly
//     what will happen.
//   - Superseded: Delete still offers to archive it for tidiness; Edit is
//     disabled - a newer version already exists to edit instead.
//   - Archived: both are disabled - there's nothing left to do here.
//   - A Free Pilot that's already past "not_started" (Active/Results
//     Review/...) disables Edit - its own Convert/Extend/Close actions on
//     the agreement detail page are the correct way to create its next
//     version, not this generic one.
export default function AgreementsTableClient({ agreements }: { agreements: CrmClientAgreementRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deletingAgreement, setDeletingAgreement] = useState<CrmClientAgreementRow | null>(null);

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }

  function handleEditFinalized(agreement: CrmClientAgreementRow) {
    if (
      !confirm(
        `"${agreement.legal_business_name}" (${agreement.agreement_number}) has already been ${agreement.status}. Editing it will create a new draft version and mark this version as superseded - its history, consent record, and timestamps are preserved unchanged. Continue?`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createNewAgreementVersionAction(agreement.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.agreementId) router.push(`/admin/crm/agreements/${result.agreementId}`);
    });
  }

  function handleDeleteDraftConfirmed() {
    if (!deletingAgreement) return;
    const agreement = deletingAgreement;
    setError(null);
    startTransition(async () => {
      const result = await deleteDraftAgreementAction(agreement.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeletingAgreement(null);
    });
  }

  function handleArchiveFinalized(agreement: CrmClientAgreementRow) {
    if (
      !confirm(
        `"${agreement.legal_business_name}" (${agreement.agreement_number}) has already been ${agreement.status} and cannot be permanently deleted. It will be archived instead, preserving its full history. Continue?`
      )
    ) {
      return;
    }
    runAction(() => archiveAgreementAction(agreement.id));
  }

  return (
    <>
      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Agreement #</th>
              <th className="px-4 py-3">Business Name</th>
              <th className="px-4 py-3">Campaign Type</th>
              <th className="px-4 py-3">Service Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agreements.map((agreement) => {
              const isDraft = agreement.status === "draft";
              const isArchived = agreement.status === "archived";
              const isSuperseded = agreement.status === "superseded";
              const pilotUnderway = agreement.campaign_type === "free_pilot" && agreement.pilot_status !== "not_started";
              const canEdit = isDraft || (!isArchived && !isSuperseded && !pilotUnderway);
              const editDisabledReason = isArchived
                ? "An archived agreement cannot be edited."
                : isSuperseded
                  ? "This version has been superseded by a newer agreement - edit that version instead."
                  : pilotUnderway
                    ? "This pilot is already underway - use Convert/Extend/Close on the agreement page instead."
                    : undefined;

              return (
                <tr key={agreement.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-600">{agreement.agreement_number}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/admin/crm/agreements/${agreement.id}`} className="hover:text-sky-700 hover:underline">
                      {agreement.legal_business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{CAMPAIGN_TYPE_LABELS[agreement.campaign_type]}</td>
                  <td className="px-4 py-3 text-slate-600">{agreement.service_type}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{agreement.status}</td>
                  <td className="px-4 py-3 text-slate-600">{agreement.version}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/admin/crm/agreements/${agreement.id}`} className={actionLinkClass}>
                        View
                      </Link>

                      {isDraft ? (
                        <Link href={`/admin/crm/agreements/${agreement.id}`} className={actionLinkClass}>
                          Edit
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={!canEdit || isPending}
                          title={editDisabledReason}
                          onClick={() => handleEditFinalized(agreement)}
                          className={actionLinkClass}
                        >
                          Edit
                        </button>
                      )}

                      {isDraft ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setDeletingAgreement(agreement)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isArchived || isPending}
                          title={isArchived ? "Already archived." : "Finalized agreements are archived, not permanently deleted."}
                          onClick={() => handleArchiveFinalized(agreement)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:text-slate-300"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {agreements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No agreements yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {deletingAgreement && (
        <ConfirmDeleteModal
          title="Permanently Delete Draft Agreement"
          recordLabel="Agreement #"
          recordNumber={deletingAgreement.agreement_number}
          secondaryLabel="Business"
          clientName={deletingAgreement.legal_business_name}
          amountFieldLabel="Campaign Type"
          amountLabel={CAMPAIGN_TYPE_LABELS[deletingAgreement.campaign_type]}
          warning="This draft has never been sent or signed, so nothing else references it - deleting it removes the record entirely."
          isPending={isPending}
          onConfirm={handleDeleteDraftConfirmed}
          onCancel={() => setDeletingAgreement(null)}
        />
      )}
    </>
  );
}
