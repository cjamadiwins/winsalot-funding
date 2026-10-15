"use client";

import { useMemo, useRef, useState } from "react";
import { resolveClientNotificationRecipient } from "@/lib/leadgen-client-notification";
import {
  PROPOSAL_REQUIREMENTS_PLACEHOLDER,
  PROPOSAL_SERVICES,
  buildProposalRequestDraft,
  hasActiveProposalRequest,
  proposalStatusLabel,
  supportsProposalBrief,
  validatePreparedProposal,
  validateProposalRequest,
  type LeadProposalRow,
  type ProposalDraftRow,
  type ProposalServiceKey,
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
//
// mode "prepare" (agents): the same composer, but it only SAVES the request for
// Admin approval - nothing is emailed, the client's address isn't shown, and the
// placeholder may stay. mode "send" (Admin): approves and sends, starting from
// the agent's prepared draft when there is one - or saves its own draft.
//
// For website-services clients a "Generate from details" section builds the
// request from the decision-maker and the services the prospect asked about
// (rebranding is always worded as a possible, unapproved add-on). Generating only
// fills the form: nothing is saved or emailed until a button below is pressed.
export default function ProposalRequestModal({
  lead,
  client,
  proposal,
  preparedDraft = null,
  mode = "send",
  assignedAgentName = null,
  onClose,
  onSend,
  onSaveDraft,
  onDraftSaved,
  onSent,
}: {
  lead: LeadgenLeadRow;
  client: LeadgenClientRow;
  proposal: LeadProposalRow | null;
  preparedDraft?: ProposalDraftRow | null;
  mode?: "send" | "prepare";
  assignedAgentName?: string | null;
  onClose: () => void;
  onSend: (formData: FormData) => Promise<RequestProposalSendResult>;
  // Admin only: save the request as a draft without emailing anything.
  onSaveDraft?: (formData: FormData) => Promise<{ error?: string }>;
  onDraftSaved?: () => void;
  onSent: (warning?: string) => void;
}) {
  const prepare = mode === "prepare";
  const draft = useMemo(() => (preparedDraft ? { subject: preparedDraft.subject, body: preparedDraft.body } : buildProposalRequestDraft({ client, lead })), [client, lead, preparedDraft]);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const showBrief = supportsProposalBrief(client);
  const [decisionMaker, setDecisionMaker] = useState(lead.contact_name ?? "");
  const [services, setServices] = useState<ProposalServiceKey[]>(["seo", "website_improvements"]);
  // Confirmed (default): the prospect asked for these services. Unticked: the prospect only asked for a
  // proposal, so Teknokraft is asked to RECOMMEND and the services are worded as possibilities.
  const [servicesConfirmed, setServicesConfirmed] = useState(true);
  const [prospectNote, setProspectNote] = useState("");
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);
  // Synchronous re-entrancy guard: state updates are async, so two quick clicks
  // could both pass a `submitting` check; a ref cannot.
  const inFlight = useRef(false);

  const recipient = resolveClientNotificationRecipient(client);
  const recipientError = !prepare && "error" in recipient ? recipient.error : null;
  const alreadyRequested = !prepare && hasActiveProposalRequest(proposal);
  const validationError = prepare ? validatePreparedProposal({ subject, body }) : validateProposalRequest({ subject, body });
  const hasPlaceholder = body.includes(PROPOSAL_REQUIREMENTS_PLACEHOLDER);
  const canContinue = !recipientError && !validationError && (!alreadyRequested || acknowledged);

  function generateFromDetails() {
    if (services.length === 0) return;
    const generated = buildProposalRequestDraft({ client, lead, brief: { decisionMaker, services, servicesConfirmed, prospectNote, assignedAgent: assignedAgentName } });
    setSubject(generated.subject);
    setBody(generated.body);
    setError(null);
    setStep("edit");
    setGeneratedNote("Draft generated from the details above. Review and edit it below; nothing has been saved or emailed.");
  }

  async function handleSaveDraft() {
    if (inFlight.current || !onSaveDraft || validatePreparedProposal({ subject, body })) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("subject", subject);
      formData.set("body", body);
      const result = await onSaveDraft(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDraftSaved?.();
    } catch {
      setError("Something went wrong saving the draft. Try again.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

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
      // The server refuses a second email for a lead that already has one unless told so.
      if (alreadyRequested && acknowledged) formData.set("confirm_resend", "yes");
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
        aria-label={prepare ? "Prepare Proposal Request" : "Generate Proposal Request"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--crm-surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">{prepare ? "Prepare Proposal Request" : "Generate Proposal Request"}</h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            ✕
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-slate-200 p-3.5 text-[13px] sm:grid-cols-3">
          <Info label="To (client)" value={client.contact_name ? `${client.name} (${client.contact_name})` : client.name} />
          {!prepare && <Info label="Client email" value={"recipient" in recipient ? recipient.recipient.email : null} />}
          <Info label="Proposal status" value={proposalStatusLabel(proposal?.status)} />
          <Info label="Prospect" value={lead.business_name} />
          <Info label="Prospect contact" value={lead.contact_name} />
          <Info label="Prospect email" value={lead.email} />
        </dl>

        {prepare ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600">
            This saves the request for Admin to review. <span className="font-semibold">Nothing is emailed</span> until an Admin approves and sends it to {client.name}.
            {preparedDraft ? " Saving replaces the draft already prepared for this lead." : ""}
          </p>
        ) : (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600">
          This is sent to <span className="font-semibold">{client.name}</span> — never to the prospect — and also appears in the client&apos;s portal under Communications. Sending it does not
          mark the proposal as sent to the prospect.
          {preparedDraft ? " Starting from the draft prepared by an agent." : ""}
        </p>
        )}

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

        {showBrief && step === "edit" && (
          <fieldset className="mt-4 rounded-lg border border-slate-200 p-3.5">
            <legend className="px-1 text-sm font-semibold text-slate-700">Generate from details</legend>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Decision-maker</span>
              <input value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} placeholder="Who decides on the proposal" className={inputClass} />
            </label>
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={servicesConfirmed} onChange={(e) => setServicesConfirmed(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="font-semibold">The prospect asked for these services.</span> Untick this if they only asked for a proposal: {client.name} will then be asked to review the website and
                recommend, and the ticked areas are listed only as possibilities, not requirements.
              </span>
            </label>
            <div className="mt-3 space-y-1.5">
              <p className="text-sm font-semibold text-slate-600">{servicesConfirmed ? "Services the prospect asked about" : "Areas for " + client.name + " to assess (not confirmed)"}</p>
              {PROPOSAL_SERVICES.map((service) => (
                <label key={service.key} className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={services.includes(service.key)}
                    onChange={(e) => setServices((current) => (e.target.checked ? [...current, service.key] : current.filter((key) => key !== service.key)))}
                    className="mt-0.5"
                  />
                  <span>{service.label}</span>
                </label>
              ))}
            </div>
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">What the prospect said (optional)</span>
              <textarea
                value={prospectNote}
                onChange={(e) => setProspectNote(e.target.value)}
                maxLength={500}
                placeholder="e.g. The decision-maker has asked for a proposal and will contact us after reviewing it."
                className={`${inputClass} min-h-[64px] resize-y`}
              />
              <span className="text-xs text-slate-500">Included in the email exactly as typed. The lead&apos;s internal notes are never copied.</span>
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Rebranding is always worded as a possible additional service, not an approved project. No prices, ranking guarantees or results are added: {client.name} provides the estimates.
            </p>
            <button
              type="button"
              disabled={services.length === 0 || submitting}
              onClick={generateFromDetails}
              className="mt-3 rounded-full border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Generate draft
            </button>
            {generatedNote && <p className="mt-2 text-sm text-emerald-700">{generatedNote}</p>}
          </fieldset>
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

            {hasPlaceholder && !prepare && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                Replace the bracketed requirements placeholder with the prospect&apos;s verified requirements, scope, budget and timeline before sending.
              </p>
            )}
            {(prepare || !hasPlaceholder) && validationError && <p className="text-sm font-medium text-rose-600">{validationError}</p>}
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={!canContinue || submitting}
                onClick={() => (prepare ? void handleConfirmSend() : setStep("confirm"))}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {prepare ? (submitting ? "Saving…" : "Submit for Admin approval") : "Review & Send"}
              </button>
              {!prepare && onSaveDraft && (
                <button
                  type="button"
                  disabled={submitting || Boolean(validatePreparedProposal({ subject, body }))}
                  onClick={handleSaveDraft}
                  className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Save as draft"}
                </button>
              )}
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
