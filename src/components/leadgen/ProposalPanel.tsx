"use client";

import { useState, useTransition } from "react";
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_STYLES,
  isProposalStatus,
  proposalStatusLabel,
  type LeadProposalRow,
  type ProposalStatus,
} from "@/lib/leadgen-proposal";
import { LEADGEN_EMAIL_STATUS_LABELS, LEADGEN_EMAIL_STATUS_STYLES, type LeadgenEmailRow } from "@/lib/leadgen-types";

function formatDate(value: string | null | undefined): string | null {
  return value ? new Date(value).toLocaleString() : null;
}

// Lead-page "Proposal" card: the Proposal Status, when it was requested and the
// delivery state of the request email (sent / delivered / bounced / failed, with
// timestamps - the same leadgen_emails tracking every other email uses).
// Admin can change the status by hand; agents see it read-only and never the
// email details.
export default function ProposalPanel({
  proposal,
  requestEmail,
  clientName,
  onUpdateStatus,
}: {
  proposal: LeadProposalRow | null;
  // Latest proposal-request email for this lead (Admin view only).
  requestEmail?: LeadgenEmailRow | null;
  clientName: string;
  // Present only for Admin.
  onUpdateStatus?: (status: ProposalStatus) => Promise<{ error?: string } | void>;
}) {
  const status: ProposalStatus = proposal?.status ?? "not_requested";
  const [selected, setSelected] = useState<ProposalStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!onUpdateStatus || selected === status || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await onUpdateStatus(selected);
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  const emailReason = requestEmail?.status === "bounced" ? requestEmail.bounce_reason : requestEmail?.status === "failed" ? requestEmail.failure_reason : null;

  return (
    <section aria-label="Proposal" className="mt-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-slate-900">Proposal</h2>
        <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${PROPOSAL_STATUS_STYLES[status]}`}>{proposalStatusLabel(status)}</span>
      </div>

      {proposal && proposal.request_count > 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          Requested from {clientName}
          {formatDate(proposal.first_requested_at) ? ` on ${formatDate(proposal.first_requested_at)}` : ""}
          {proposal.request_count > 1 ? ` · ${proposal.request_count} requests, latest ${formatDate(proposal.last_requested_at)}` : ""}.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No proposal has been requested from {clientName} for this lead yet.</p>
      )}

      {requestEmail && (
        <div className="mt-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-800">Request email</span>
            <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[requestEmail.status]}`}>{LEADGEN_EMAIL_STATUS_LABELS[requestEmail.status]}</span>
          </div>
          <p className="mt-1 text-slate-600">
            To {requestEmail.to_email}
            {formatDate(requestEmail.sent_at) ? ` · sent ${formatDate(requestEmail.sent_at)}` : ""}
            {formatDate(requestEmail.delivered_at) ? ` · delivered ${formatDate(requestEmail.delivered_at)}` : ""}
            {formatDate(requestEmail.bounced_at) ? ` · bounced ${formatDate(requestEmail.bounced_at)}` : ""}
            {formatDate(requestEmail.failed_at) ? ` · failed ${formatDate(requestEmail.failed_at)}` : ""}
          </p>
          {emailReason && <p className="mt-1 text-sm text-rose-600">{emailReason}</p>}
        </div>
      )}

      {onUpdateStatus && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold text-slate-600" htmlFor="proposal-status">
              Proposal status
            </label>
            <select
              id="proposal-status"
              value={selected}
              onChange={(e) => isProposalStatus(e.target.value) && setSelected(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              {PROPOSAL_STATUSES.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={isPending || selected === status}
              onClick={save}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Update status"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Emailing {clientName} only sets “Proposal Requested”. Choose “Proposal Sent” yourself once the proposal has actually gone to the prospect. Changing the status never sends an email.
          </p>
          {error && <p className="mt-1.5 text-sm font-medium text-rose-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
