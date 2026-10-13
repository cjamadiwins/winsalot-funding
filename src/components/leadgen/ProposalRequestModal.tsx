"use client";

import { useMemo, useRef, useState } from "react";
import { resolveClientNotificationRecipient } from "@/lib/leadgen-client-notification";
import {
  PROPOSAL_REQUIREMENTS_PLACEHOLDER,
  buildProposalRequestDraft,
  hasActiveProposalRequest,
  proposalStatusLabel,
  validateProposalRequest,
  type LeadProposalRow,
} from "@/lib/leadgen-proposal";
import type { LeadgenClientRow, LeadgenLeadRow } from "@/lib/leadgen-types";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900";

export type RequestProposalSendResult = { emailId?: string; error?: string; warning?: string; duplicate?: boolean };

// One key per composer session (regenerated after a failed attempt): the server
// refuses a second send carrying the same key, so a repeated click, a retried
// request or a second tab can never email the client twice.
function newRequestKey(): string {
  const cryptoApi = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate text-slate-800" title={value ?? undefined}>
        {value || "—"}
      </dd>
    </div>
  );
}

// Admin "Request Proposal" composer. The recipient is the lead's CLIENT, shown
// read-only - it is resolved from the client record here for display and again
// on the server for the actual send, so it can never be the prospect or typed
// in. Subject and body are prefilled from the lead and fully editable; sending
// needs an explicit confirmation step.
export default function ProposalRequestModal({
  lead,
  client,
  proposal,
  onClose,
  onSend,
  onSent,
}: {
  lead: LeadgenLeadRow;
  client: LeadgenClientRow;
  proposal: LeadProposalRow | null;
  onClose: () => void;
  onSend: (formData: FormData) => Promise<RequestProposalSendResult>;
  onSent: (warning?: string) => void;
}) {
  const draft = useMemo(() => buildProposalRequestDraft({ client, lead }), [client, lead]);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [requestKey, setRequestKey] = useState(newRequestKey);
  // Synchronous re-entrancy guard: state updates are async, so two quick clicks
  // could both pass a `submitting` check; a ref cannot.
  const inFlight = useRef(false);

  const recipient = resolveClientNotificationRecipient(client);
  const recipientError = "error" in recipient ? recipient.error : null;
  const alreadyRequested = hasActiveProposalRequest(proposal);
  const validationError = validateProposalRequest({ subject, body });
  const hasPlaceholder = body.includes(PROPOSAL_REQUIREMENTS_PLACEHOLDER);
  const canContinue = !recipientError && !validationError && (!alreadyRequested || acknowledged);

  async function handleConfirmSend() {
    if (inFlight.current || !canContinue) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("subject", subject);
      formData.set("body", body);
      formData.set("request_key", requestKey);
      const result = await onSend(formData);
      if (result.error) {
        setError(result.error);
        setRequestKey(newRequestKey());
        setStep("edit");
        return;
      }
      onSent(result.warning);
    } catch {
      setError("Something went wrong sending the request. Check the email log before trying again.");
      setStep("edit");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={submitting ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Request Proposal"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--crm-surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">Request Proposal</h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            ✕
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-slate-200 p-3.5 text-[13px] sm:grid-cols-3">
          <Info label="To (client)" value={client.contact_name ? `${client.name} (${client.contact_name})` : client.name} />
          <Info label="Client email" value={"recipient" in recipient ? recipient.recipient.email : null} />
          <Info label="Proposal status" value={proposalStatusLabel(proposal?.status)} />
          <Info label="Prospect" value={lead.business_name} />
          <Info label="Prospect contact" value={lead.contact_name} />
          <Info label="Prospect email" value={lead.email} />
        </dl>

        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600">
          This is sent to <span className="font-semibold">{client.name}</span> — never to the prospect — and also appears in the client&apos;s portal under Communications. Sending it does not
          mark the proposal as sent to the prospect.
        </p>

        {recipientError && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{recipientError}</p>}

        {alreadyRequested && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            <p className="font-semibold">A proposal was already requested for this lead</p>
            <p className="mt-0.5">
              {proposal?.request_count === 1 ? "1 request" : `${proposal?.request_count} requests`} sent
              {proposal?.last_requested_at ? `, most recently ${new Date(proposal.last_requested_at).toLocaleString()}` : ""}. Current status: {proposalStatusLabel(proposal?.status)}.
            </p>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
              <span>I understand {client.name} will be emailed again.</span>
            </label>
          </div>
        )}

        {step === "edit" ? (
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Message</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} min-h-[360px] resize-y font-mono text-sm`} />
            </label>

            {hasPlaceholder && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                Replace the bracketed requirements placeholder with the prospect&apos;s verified requirements, scope, budget and timeline before sending.
              </p>
            )}
            {!hasPlaceholder && validationError && <p className="text-sm font-medium text-rose-600">{validationError}</p>}
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={!canContinue}
                onClick={() => setStep("confirm")}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review &amp; Send
              </button>
              <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3.5 text-sm text-sky-900">
              <p className="font-semibold">Confirm before sending</p>
              <p className="mt-1">
                This will email <span className="font-semibold">{"recipient" in recipient ? recipient.recipient.email : ""}</span> now and log it on this lead. It cannot be undone.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3.5 text-sm">
              <p>
                <span className="font-semibold text-slate-600">Subject:</span> {subject}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-slate-700">{body}</p>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmSend}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Confirm & Send"}
              </button>
              <button type="button" disabled={submitting} onClick={() => setStep("edit")} className="text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                Back to Edit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
