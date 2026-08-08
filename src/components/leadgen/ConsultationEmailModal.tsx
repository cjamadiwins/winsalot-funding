"use client";

import { useState } from "react";
import { isValidEmail, type LeadgenLeadRow } from "@/lib/leadgen-types";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export type SendConsultationEmailResult = { error?: string; emailId?: string };
type FollowUpTemplateOption = { id: string; name: string; subject: string; body: string };

// "Send Consultation Email" workflow (the brief's centerpiece feature):
// a review screen prefilled from the lead/campaign, editable before
// sending, with an explicit confirm step and the send button disabled
// while the request is in flight to prevent an accidental duplicate
// send.
export default function ConsultationEmailModal({
  lead,
  agentName,
  campaignName,
  title = "Send Consultation Email",
  defaultSubject,
  defaultBody,
  bookingUrl,
  servicesUrl,
  templateOptions,
  templateSelectLabel,
  onClose,
  onSend,
  onSent,
}: {
  lead: LeadgenLeadRow;
  agentName: string;
  campaignName: string | null;
  title?: string;
  defaultSubject: string;
  defaultBody: string;
  // Set only by the "Send Follow-Up Email" call site - lets the server
  // action swap each plain-text booking/services marker in `body` for a
  // real HTML button (see leadgenButtonHtml in lib/leadgen-email.ts). If
  // the user edits a marker out of the body below, the action just falls
  // back to a plain (no-button) HTML rendering for that part - never an
  // error.
  bookingUrl?: string | null;
  servicesUrl?: string | null;
  templateOptions?: FollowUpTemplateOption[];
  templateSelectLabel?: string;
  onClose: () => void;
  onSend: (formData: FormData) => Promise<SendConsultationEmailResult>;
  onSent: () => void;
}) {
  const selectedTemplate = templateOptions?.[0] ?? null;
  const [toEmail, setToEmail] = useState(lead.email ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(selectedTemplate?.id ?? "");
  const [subject, setSubject] = useState(selectedTemplate?.subject ?? defaultSubject);
  const [body, setBody] = useState(selectedTemplate?.body ?? defaultBody);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = isValidEmail(toEmail);

  function handleTemplateChange(nextTemplateId: string) {
    setSelectedTemplateId(nextTemplateId);
    const nextTemplate = templateOptions?.find((t) => t.id === nextTemplateId);
    if (!nextTemplate) return;
    setSubject(nextTemplate.subject);
    setBody(nextTemplate.body);
  }

  async function handleConfirmSend() {
    if (submitting) return; // belt-and-suspenders against a double-click racing state updates
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("to_email", toEmail);
    formData.set("subject", subject);
    formData.set("body", body);
    if (bookingUrl) formData.set("booking_url", bookingUrl);
    if (servicesUrl) formData.set("services_url", servicesUrl);

    const result = await onSend(formData);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      setStep("edit");
      return;
    }

    onSent();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={submitting ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-[var(--crm-surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-slate-500">
          <div>
            Prospect: <span className="font-medium text-slate-700">{lead.business_name}</span>
          </div>
          <div>
            Agent: <span className="font-medium text-slate-700">{agentName}</span>
          </div>
          {campaignName && (
            <div>
              Campaign: <span className="font-medium text-slate-700">{campaignName}</span>
            </div>
          )}
        </dl>

        {step === "edit" ? (
          <div className="mt-4 space-y-3">
            {templateOptions && templateOptions.length > 0 && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">{templateSelectLabel ?? "Saved Template"}</span>
                <select value={selectedTemplateId} onChange={(e) => handleTemplateChange(e.target.value)} className={inputClass}>
                  {templateOptions.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Recipient Email</span>
              <input
                type="email"
                required
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                className={inputClass}
              />
              {!lead.email && <span className="text-[12px] text-amber-700">No email on file for this lead - enter one to continue.</span>}
              {toEmail && !emailValid && <span className="text-[12px] text-rose-600">Enter a valid email address.</span>}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required className={inputClass} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Message</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                className={`${inputClass} min-h-[280px] resize-y font-mono text-[13px]`}
              />
            </label>

            {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={!toEmail || !emailValid || !subject.trim() || !body.trim()}
                onClick={() => setStep("confirm")}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review &amp; Send
              </button>
              <button type="button" onClick={onClose} className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3.5 text-[13px] text-sky-900">
              <p className="font-semibold">Confirm before sending</p>
              <p className="mt-1">
                This will send an email to <span className="font-semibold">{toEmail}</span> right now. This cannot be undone.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3.5 text-[13px]">
              <p>
                <span className="font-semibold text-slate-600">Subject:</span> {subject}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-slate-700">{body}</p>
            </div>

            {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmSend}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Confirm & Send"}
              </button>
              <button type="button" disabled={submitting} onClick={() => setStep("edit")} className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                Back to Edit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
