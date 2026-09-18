"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS,
  CONSULTATION_GUIDE_CHECKLIST_ITEMS,
  CONSULTATION_GUIDE_CLOSING_LINE,
  CONSULTATION_GUIDE_DISCOVERY_QUESTIONS,
  CONSULTATION_GUIDE_FOLLOW_UP_STATUS_LABELS,
  CONSULTATION_GUIDE_FOLLOW_UP_STATUS_STYLES,
  CONSULTATION_GUIDE_INTERNAL_REMINDER,
  CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS,
  CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS,
  CONSULTATION_GUIDE_LENDING_WARNING,
  CONSULTATION_GUIDE_OPENING_LINE,
  CONSULTATION_GUIDE_SERVICES,
  CONSULTATION_GUIDE_SERVICE_LABELS,
  CONSULTATION_GUIDE_STATUS_LABELS,
  CONSULTATION_GUIDE_STATUS_STYLES,
  CONSULTATION_GUIDE_SUMMARY_FIELDS,
  CONSULTATION_GUIDE_VALUE_DISCLAIMER,
  CONSULTATION_GUIDE_VALUE_SECTIONS,
  LEADGEN_FIT_STATUS_LABELS,
  LEADGEN_FIT_STATUSES,
  LENDING_FIT_STATUS_LABELS,
  LENDING_FIT_STATUSES,
  type ConsultationGuideAnswers,
  type ConsultationGuideChecklist,
  type ConsultationGuideService,
  type CrmConsultationGuideRow,
} from "@/lib/consultation-guide";
import { previewConsultationCompletionAction, type ConsultationCompletionPreview } from "./actions";
import AppointmentPicker from "./AppointmentPicker";

type ActionResult = {
  id?: string;
  error?: string;
  outcome?: "completed" | "already_completed";
  followUpEmailStatus?: string;
  noFollowUpEmailReason?: string | null;
};

const inputClasses =
  "w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelClasses = "text-[12px] font-semibold text-slate-700";
const sectionClasses = "mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5";
const sectionHeadingClasses = "text-[15px] font-bold text-slate-900";

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue?: string | null; type?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClasses}>{label}</span>
      <input type={type} name={name} defaultValue={defaultValue ?? ""} className={inputClasses} />
    </label>
  );
}

function QuestionList({
  questions,
  answers,
}: {
  questions: readonly { key: string; label: string }[];
  answers: ConsultationGuideAnswers;
}) {
  return (
    <div className="mt-4 space-y-4">
      {questions.map((q) => (
        <label key={q.key} className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-800">{q.label}</span>
          <textarea name={q.key} defaultValue={answers[q.key] ?? ""} className={`${inputClasses} min-h-[60px] resize-y`} />
        </label>
      ))}
    </div>
  );
}

function FitStatusPicker({
  name,
  options,
  labels,
  defaultValue,
}: {
  name: string;
  options: readonly string[];
  labels: Record<string, string>;
  defaultValue: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {options.map((option) => (
        <label key={option} className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
          <input type="radio" name={name} value={option} defaultChecked={defaultValue === option} className="h-4 w-4" />
          {labels[option]}
        </label>
      ))}
    </div>
  );
}

type PrefillableField = "business_name" | "contact_name" | "phone" | "email" | "industry" | "location" | "consultant_name";

export default function ConsultationGuideForm({
  guide,
  opportunityId,
  appointmentId,
  linkedAppointmentLabel,
  appointmentNotFound,
  showAppointmentPicker,
  initial,
  initialService,
  saveAction,
  completeAction,
  retryFollowUpAction,
  backHref,
}: {
  guide: CrmConsultationGuideRow | null;
  opportunityId?: string | null;
  // The linked appointment (if any), passed by ?appointmentId= on /new or
  // read off an existing guide's own appointment_id on reopen.
  appointmentId?: string | null;
  linkedAppointmentLabel?: string | null;
  // True when ?appointmentId= pointed at an appointment that no longer
  // exists - shown as a notice, never a crash; Admin can still search for
  // a different one or fill the guide in manually.
  appointmentNotFound?: boolean;
  // Shows the manual appointment-search fallback - only on a brand-new
  // guide opened with neither ?appointmentId= nor ?opportunityId=.
  showAppointmentPicker?: boolean;
  // Only used when guide is null - populated from an existing Growth CRM
  // opportunity or appointment when the guide was opened from one of
  // those records (see consultation-guide/new/page.tsx).
  initial?: Partial<Record<PrefillableField, string | null>>;
  // Auto-selected from a linked appointment's own service_type when it's
  // an unambiguous match (never for "both_services" - see
  // new/page.tsx's serviceFromAppointmentType).
  initialService?: ConsultationGuideService | null;
  saveAction: (formData: FormData) => Promise<ActionResult>;
  completeAction: (formData: FormData) => Promise<ActionResult>;
  // Only passed for an existing, completed guide whose follow-up email
  // failed - undefined everywhere else (a brand-new guide has nothing to
  // retry yet).
  retryFollowUpAction?: (id: string) => Promise<{ error?: string; message?: string }>;
  backHref: string;
}) {
  function val(field: PrefillableField): string | null | undefined {
    return guide ? guide[field] : initial?.[field];
  }

  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completePreview, setCompletePreview] = useState<ConsultationCompletionPreview | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const discovery = guide?.discovery ?? {};
  const leadgenFit = guide?.leadgen_fit ?? {};
  const campaignExpectations = guide?.campaign_expectations ?? {};
  const lendingFit = guide?.lending_fit ?? {};
  const summary = guide?.summary ?? {};
  const checklist: ConsultationGuideChecklist = guide?.checklist ?? {};

  function runSave(label: string, action: (formData: FormData) => Promise<ActionResult>) {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error && result.outcome !== "completed") {
        setError(result.error);
        return;
      }

      let finalMessage = label;
      if (result.outcome === "already_completed") {
        finalMessage = "This consultation was already marked completed.";
      } else if (result.outcome === "completed") {
        const statusLabel = result.followUpEmailStatus ? CONSULTATION_GUIDE_FOLLOW_UP_STATUS_LABELS[result.followUpEmailStatus as keyof typeof CONSULTATION_GUIDE_FOLLOW_UP_STATUS_LABELS] : null;
        if (result.error) {
          // Completion itself succeeded, but the follow-up email failed to
          // send - the consultation stays Completed either way (see
          // completeConsultationGuideAction), so this is a warning, not a
          // blocking error.
          setError(result.error);
          finalMessage = "Consultation marked complete.";
        } else if (result.noFollowUpEmailReason) {
          finalMessage = `Consultation marked complete. No follow-up email sent (${result.noFollowUpEmailReason}).`;
        } else if (statusLabel) {
          finalMessage = `Consultation marked complete. Follow-up email: ${statusLabel}.`;
        }
      }
      setMessage(finalMessage);

      if (!guide && result.id) {
        router.push(`/admin/consultation-guide/${result.id}`);
      } else {
        router.refresh();
      }
    });
  }

  async function openCompleteModal() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const preview = await previewConsultationCompletionAction(formData);
      if ("error" in preview) {
        setError(preview.error);
        return;
      }
      setCompletePreview(preview);
    });
  }

  function confirmComplete() {
    setCompletePreview(null);
    runSave("Consultation marked complete.", completeAction);
  }

  function handleRetryFollowUp() {
    if (!retryFollowUpAction || !guide) return;
    setRetryMessage(null);
    startTransition(async () => {
      const result = await retryFollowUpAction(guide.id);
      setRetryMessage(result.error ?? result.message ?? null);
      router.refresh();
    });
  }

  const showFollowUpBadge = guide && guide.status === "completed" && guide.service;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
          ← Back to Consultation Guides
        </Link>
        <div className="flex items-center gap-2">
          {showFollowUpBadge && (
            <span
              title={guide!.follow_up_email_error ?? guide!.no_follow_up_email_reason ?? undefined}
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${CONSULTATION_GUIDE_FOLLOW_UP_STATUS_STYLES[guide!.follow_up_email_status]}`}
            >
              Follow-Up Email: {CONSULTATION_GUIDE_FOLLOW_UP_STATUS_LABELS[guide!.follow_up_email_status]}
            </span>
          )}
          {guide && (
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${CONSULTATION_GUIDE_STATUS_STYLES[guide.status]}`}
            >
              {CONSULTATION_GUIDE_STATUS_LABELS[guide.status]}
            </span>
          )}
        </div>
      </div>

      {message && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{message}</p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
      )}
      {retryMessage && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{retryMessage}</p>
      )}

      {guide && guide.status === "completed" && guide.follow_up_email_status === "failed" && retryFollowUpAction && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleRetryFollowUp}
          className="mt-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3.5 py-2 text-[12.5px] font-bold text-rose-700 transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Retry Follow-Up Email
        </button>
      )}

      {(linkedAppointmentLabel || appointmentNotFound) && (
        <p
          className={`mt-3 rounded-lg border px-4 py-2.5 text-[12.5px] font-medium ${
            appointmentNotFound ? "border-amber-200 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          {appointmentNotFound
            ? "The linked appointment could not be found. Search for a different one below, or fill in this consultation manually."
            : `Linked Appointment: ${linkedAppointmentLabel}`}
        </p>
      )}

      {showAppointmentPicker && !guide && <AppointmentPicker />}

      <form ref={formRef} className="mt-2">
        <input type="hidden" name="opportunity_id" defaultValue={guide?.opportunity_id ?? opportunityId ?? ""} />
        <input type="hidden" name="appointment_id" defaultValue={guide?.appointment_id ?? appointmentId ?? ""} />

        <div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Client Consultation Guide</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use during prospect consultations to capture goals, campaign requirements, qualification criteria, and next steps.
          </p>

          {/* 1. Consultation Details */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>1. Consultation Details</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Business Name" name="business_name" defaultValue={val("business_name")} />
              <Field label="Contact Name" name="contact_name" defaultValue={val("contact_name")} />
              <Field label="Phone" name="phone" defaultValue={val("phone")} />
              <Field label="Email" name="email" defaultValue={val("email")} />
              <Field label="Industry" name="industry" defaultValue={val("industry")} />
              <Field label="Location" name="location" defaultValue={val("location")} />
              <Field
                label="Consultation Date"
                name="consultation_date"
                type="date"
                defaultValue={guide?.consultation_date ?? new Date().toISOString().slice(0, 10)}
              />
              <Field label="Consultant" name="consultant_name" defaultValue={val("consultant_name")} />
            </div>
            <div className="mt-4">
              <span className={labelClasses}>
                Service <span className="text-rose-600">*</span>
              </span>
              <p className="mt-0.5 text-[11.5px] text-slate-500">Required before this consultation can be marked complete.</p>
              <div className="mt-2 flex flex-wrap gap-4">
                {CONSULTATION_GUIDE_SERVICES.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="service"
                      value={option}
                      defaultChecked={(guide?.service ?? initialService) === option}
                      className="h-4 w-4"
                    />
                    {CONSULTATION_GUIDE_SERVICE_LABELS[option]}
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* 2. Start the Conversation */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>2. Start the Conversation</h2>
            <p className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-[13.5px] italic text-sky-900">
              &ldquo;{CONSULTATION_GUIDE_OPENING_LINE}&rdquo;
            </p>
          </section>

          {/* 3. What Winsalot Corp. Provides & Client Benefits */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>3. What Winsalot Corp. Provides &amp; Client Benefits</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {CONSULTATION_GUIDE_VALUE_SECTIONS.map((value) => (
                <div key={value.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-[13.5px] font-bold text-slate-900">{value.title}</h3>
                  <p className="mt-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">What we provide</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[12.5px] text-slate-700">
                    {value.provides.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Client benefits</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[12.5px] text-slate-700">
                    {value.benefits.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-lg border border-slate-300 bg-slate-100 px-4 py-2.5 text-[12.5px] font-semibold text-slate-600">
              {CONSULTATION_GUIDE_VALUE_DISCLAIMER}
            </p>
          </section>

          {/* 4. Business & Growth Discovery */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>4. Business &amp; Growth Discovery</h2>
            <QuestionList questions={CONSULTATION_GUIDE_DISCOVERY_QUESTIONS} answers={discovery} />
          </section>

          {/* 5. Lead Generation / Appointment-Setting Fit */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>5. Lead Generation / Appointment-Setting Fit</h2>
            <div className="mt-3">
              <FitStatusPicker
                name="leadgen_fit_status"
                options={LEADGEN_FIT_STATUSES}
                labels={LEADGEN_FIT_STATUS_LABELS}
                defaultValue={guide?.leadgen_fit_status ?? null}
              />
            </div>
            <QuestionList questions={CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS} answers={leadgenFit} />
          </section>

          {/* 6. Campaign Expectations & Handoff */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>6. Campaign Expectations &amp; Handoff</h2>
            <QuestionList questions={CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS} answers={campaignExpectations} />
            <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] font-semibold text-amber-900">
              {CONSULTATION_GUIDE_INTERNAL_REMINDER}
            </p>
          </section>

          {/* 7. Business Lending Support Fit */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>7. Business Lending Support Fit</h2>
            <div className="mt-3">
              <FitStatusPicker
                name="lending_fit_status"
                options={LENDING_FIT_STATUSES}
                labels={LENDING_FIT_STATUS_LABELS}
                defaultValue={guide?.lending_fit_status ?? null}
              />
            </div>
            <QuestionList questions={CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS} answers={lendingFit} />
            <p className="mt-5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-[12.5px] font-semibold text-rose-800">
              {CONSULTATION_GUIDE_LENDING_WARNING}
            </p>
          </section>

          {/* 8. Consultation Summary */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>8. Consultation Summary</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {CONSULTATION_GUIDE_SUMMARY_FIELDS.map((field) =>
                field.key === "follow_up_date" ? (
                  <Field key={field.key} label={field.label} name={field.key} type="date" defaultValue={summary[field.key]} />
                ) : (
                  <Field key={field.key} label={field.label} name={field.key} defaultValue={summary[field.key]} />
                )
              )}
            </div>
          </section>

          {/* 9. Close the Consultation */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>9. Close the Consultation</h2>
            <p className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-[13.5px] italic text-sky-900">
              &ldquo;{CONSULTATION_GUIDE_CLOSING_LINE}&rdquo;
            </p>
          </section>

          {/* 10. Final Checklist */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>10. Final Checklist</h2>
            <div className="mt-4 space-y-2.5">
              {CONSULTATION_GUIDE_CHECKLIST_ITEMS.map((item) => (
                <label key={item.key} className="flex items-center gap-2.5 text-[13.5px] text-slate-800">
                  <input type="checkbox" name={item.key} defaultChecked={Boolean(checklist[item.key])} className="h-4 w-4 rounded" />
                  {item.label}
                </label>
              ))}
            </div>
          </section>

          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>Notes</h2>
            <textarea
              name="notes"
              placeholder="Type any additional notes here during the consultation…"
              defaultValue={guide?.notes ?? ""}
              className={`${inputClasses} mt-3 min-h-[120px] resize-y`}
            />
          </section>
        </div>

        <div className="mt-6 flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={isPending}
            onClick={() => runSave("Consultation saved.", saveAction)}
            className="rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save Consultation
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => runSave("Saved as draft.", saveAction)}
            className="rounded-[11px] border border-slate-300 bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save as Draft
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={openCompleteModal}
            className="rounded-[11px] bg-emerald-600 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark Consultation Complete
          </button>
          {guide ? (
            <a
              href={`/admin/consultation-guide/${guide.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[11px] border border-slate-300 bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-700 transition hover:border-slate-400"
            >
              Print / Download PDF
            </a>
          ) : (
            <span
              title="Save the consultation first"
              className="cursor-not-allowed rounded-[11px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13.5px] font-bold text-slate-400"
            >
              Print / Download PDF
            </span>
          )}
        </div>
      </form>

      {completePreview && "subject" in completePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-[16px] font-bold text-slate-900">Mark Consultation Complete?</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recipient</p>
                <p className="mt-0.5 font-medium text-slate-800">{completePreview.recipientName}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Service</p>
                <p className="mt-0.5 font-medium text-slate-800">{completePreview.serviceLabel}</p>
              </div>
            </div>

            {completePreview.recipientEmail ? (
              <p className="mt-3 text-[13px] text-slate-600">
                A follow-up email will be sent to <span className="font-semibold text-slate-800">{completePreview.recipientEmail}</span>.
              </p>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
                This prospect has no email address on file. You can still complete this consultation - no follow-up email will be
                sent, and the reason will be recorded as &ldquo;No recipient email.&rdquo;
              </p>
            )}

            {completePreview.recipientEmail && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preview — Subject</p>
                <p className="mt-0.5 text-[13.5px] font-semibold text-slate-900">{completePreview.subject}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preview — Body</p>
                <pre className="mt-0.5 max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-slate-700">
                  {completePreview.bodyText}
                </pre>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setCompletePreview(null)}
                className="rounded-[10px] border border-slate-300 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 transition hover:border-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={confirmComplete}
                className="rounded-[10px] bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {completePreview.recipientEmail ? "Complete & Send Email" : "Complete Without Email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
