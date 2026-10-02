"use client";

import { useMemo, useState } from "react";
import {
  CLIENT_NOTIFICATION_TYPES,
  buildClientNotificationDraft,
  defaultNotificationType,
  displayWebsite,
  formatLeadPhone,
  leadIndustryDisplay,
  parseLeadLocation,
  resolveClientNotificationRecipient,
  type ClientNotificationType,
} from "@/lib/leadgen-client-notification";
import type { LeadgenClientRow, LeadgenLeadRow } from "@/lib/leadgen-types";
import CommunicationPreferenceBanner from "./CommunicationPreferenceBanner";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900";

export type SendClientNotificationResult = { emailId?: string; error?: string; warning?: string };

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

// Admin "Email Client" composer. The recipient is shown read-only - it is
// resolved from the lead's own client, here for display and again on the server
// for the actual send. Subject and body are prefilled from the lead and fully
// editable; changing the notification type regenerates the draft only while
// Admin hasn't edited it yet.
export default function ClientNotificationModal({
  lead,
  client,
  onClose,
  onSend,
  onSent,
}: {
  lead: LeadgenLeadRow;
  client: LeadgenClientRow;
  onClose: () => void;
  onSend: (formData: FormData) => Promise<SendClientNotificationResult>;
  onSent: (warning?: string) => void;
}) {
  const initialType = useMemo(() => defaultNotificationType(lead), [lead]);
  const [type, setType] = useState<ClientNotificationType>(initialType);
  const initialDraft = useMemo(() => buildClientNotificationDraft({ client, lead, type: initialType }), [client, lead, initialType]);
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [edited, setEdited] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipient = resolveClientNotificationRecipient(client);
  const recipientError = "error" in recipient ? recipient.error : null;
  const { location } = parseLeadLocation(lead);

  function handleTypeChange(next: ClientNotificationType) {
    setType(next);
    if (!edited) {
      const draft = buildClientNotificationDraft({ client, lead, type: next });
      setSubject(draft.subject);
      setBody(draft.body);
    }
  }

  async function handleConfirmSend() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.set("notification_type", type);
    formData.set("subject", subject);
    formData.set("body", body);
    const result = await onSend(formData);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      setStep("edit");
      return;
    }
    onSent(result.warning);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={submitting ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Email Client"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--crm-surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">Email Client</h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            ✕
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-slate-200 p-3.5 text-[13px] sm:grid-cols-3">
          <Info label="Client / Recipient" value={client.contact_name ? `${client.name} (${client.contact_name})` : client.name} />
          <Info label="Client Email" value={"recipient" in recipient ? recipient.recipient.email : null} />
          <Info label="Lead Status" value={lead.status} />
          <Info label="Business" value={lead.business_name} />
          <Info label="Contact" value={lead.contact_name} />
          <Info label="Lead Email" value={lead.email} />
          <Info label="Phone" value={formatLeadPhone(lead.phone)} />
          <Info label="Website" value={displayWebsite(lead.website)} />
          <Info label="Industry" value={leadIndustryDisplay(lead)} />
          <Info label="Location" value={location} />
        </dl>

        <CommunicationPreferenceBanner lead={lead} className="mt-3" />

        {recipientError && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{recipientError}</p>}

        {step === "edit" ? (
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Notification Type</span>
              <span className="text-xs text-slate-500">For organization and history only — sending doesn&apos;t change the lead&apos;s status.</span>
              <select value={type} onChange={(e) => handleTypeChange(e.target.value as ClientNotificationType)} className={inputClass}>
                {CLIENT_NOTIFICATION_TYPES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Subject</span>
              <input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setEdited(true);
                }}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">Message</span>
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setEdited(true);
                }}
                className={`${inputClass} min-h-[300px] resize-y font-mono text-sm`}
              />
            </label>

            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={Boolean(recipientError) || !subject.trim() || !body.trim()}
                onClick={() => setStep("confirm")}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
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
