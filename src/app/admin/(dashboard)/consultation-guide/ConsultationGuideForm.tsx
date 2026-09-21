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
import {
  ARRANGEMENT_CAMPAIGN_STATUSES,
  ARRANGEMENT_CAMPAIGN_STATUS_LABELS,
  ARRANGEMENT_CONVERSION_STATUSES,
  ARRANGEMENT_CONVERSION_STATUS_LABELS,
  ARRANGEMENT_FEE_STATUSES,
  ARRANGEMENT_FEE_STATUS_LABELS,
  ARRANGEMENT_INTERNAL_COMPLIANCE_NOTE,
  ARRANGEMENT_TYPES,
  ARRANGEMENT_TYPE_LABELS,
  CUSTOM_SPLIT_PAYMENT_DEFAULTS,
  isCustomArrangementType,
  PERFORMANCE_BASED_TRIAL_DEFAULTS,
  type ArrangementType,
} from "@/lib/commercial-arrangement";
import { previewConsultationCompletionAction, type ConsultationCompletionPreview } from "./actions";
import AppointmentPicker from "./AppointmentPicker";

type ActionResult = {
  id?: string;
  error?: string;
  outcome?: "completed" | "already_completed";
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

type PrefillableField = "business_name" | "contact_name" | "phone" | "email" | "industry" | "location" | "consultant_name" | "notes";

export default function ConsultationGuideForm({
  guide,
  opportunityId,
  appointmentId,
  linkedAppointmentLabel,
  appointmentNotFound,
  showAppointmentPicker,
  initial,
  initialService,
  updatedByName,
  saveAction,
  completeAction,
  sendFollowUpAction,
  resendFollowUpAction,
  updateFollowUpDraftAction,
  deleteAction,
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
  // Resolved display name for guide.updated_by, looked up server-side
  // ([id]/page.tsx) since the guide row itself only has the user id. Null
  // when nobody has edited it since it was created.
  updatedByName?: string | null;
  saveAction: (formData: FormData) => Promise<ActionResult>;
  completeAction: (formData: FormData) => Promise<ActionResult>;
  // Only passed for an existing, completed guide - powers the "Send Email"
  // button in the Follow-Up Email section (a brand-new, unsaved guide has
  // no draft to send yet). This is the ONLY action that ever actually
  // sends the real email - clicking it is the sole way to send.
  sendFollowUpAction?: (id: string) => Promise<{ error?: string; message?: string }>;
  // Only passed for an existing, completed guide whose follow-up email
  // already sent successfully - a deliberate, separately confirmed resend
  // of that same email, per CJ's "Any email resend must use a separate
  // confirmed Resend Email action."
  resendFollowUpAction?: (id: string) => Promise<{ error?: string; message?: string }>;
  // Only passed for an existing, completed guide - saves Admin's edits to
  // the generated draft subject/body ("Edit Email") without sending
  // anything; Send/Resend above always send whatever this last saved.
  updateFollowUpDraftAction?: (id: string, subject: string, body: string) => Promise<{ error?: string }>;
  // Only passed for an existing guide (never a brand-new, unsaved one) -
  // powers the "Delete consultation" link at the bottom of the page. Only
  // ever removes the crm_consultation_guides row itself; the linked
  // appointment, prospect, and any sent follow-up email/audit history are
  // never touched (see deleteConsultationGuideAction).
  deleteAction?: (id: string) => Promise<{ error?: string }>;
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
  const [followUpMessage, setFollowUpMessage] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [arrangementType, setArrangementType] = useState<ArrangementType>(guide?.arrangement_type ?? "standard_monthly");
  const isSplitPayment = arrangementType === "custom_split_payment";

  // Follow-Up Email section: local editable copies of the guide's saved
  // draft, so "Edit Email" never sends anything on its own - only
  // updateFollowUpDraftAction's own explicit Save Draft click persists an
  // edit, and only sendFollowUpAction/resendFollowUpAction ever send.
  const [isEditingFollowUp, setIsEditingFollowUp] = useState(false);
  const [draftSubject, setDraftSubject] = useState(guide?.follow_up_email_subject ?? "");
  const [draftBody, setDraftBody] = useState(guide?.follow_up_email_body ?? "");

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
      if (result.error) {
        setError(result.error);
        return;
      }

      let finalMessage = label;
      if (result.outcome === "already_completed") {
        finalMessage = "This consultation was already marked completed.";
      } else if (result.outcome === "completed") {
        // Completing a consultation never sends anything itself - it only
        // generates and saves a follow-up email draft for Admin to review
        // in the Follow-Up Email section below and send when ready.
        finalMessage = "Consultation marked complete. A follow-up email draft has been generated below for your review.";
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

  // The one and only click that ever sends the real email - "Clicking Send
  // Email should be the only action that sends the email." A second
  // confirm() step here would just add friction to a button that's already
  // a deliberate, separate click from Save/Complete; the real duplicate-
  // send guard is the database compare-and-swap inside
  // sendConsultationGuideFollowUpEmail itself.
  function handleSendFollowUp() {
    if (!sendFollowUpAction || !guide) return;
    if (!confirm(`Send the follow-up email to ${guide.email}? This cannot be undone.`)) return;
    setFollowUpError(null);
    setFollowUpMessage(null);
    startTransition(async () => {
      const result = await sendFollowUpAction(guide.id);
      if (result.error) setFollowUpError(result.error);
      else setFollowUpMessage(result.message ?? "Follow-up email sent.");
      router.refresh();
    });
  }

  // "Any email resend must use a separate confirmed Resend Email action" -
  // the confirm() dialog here is that explicit confirmation step; the
  // original send's own recipient/template/time/status are never touched
  // by this (see resendConsultationGuideFollowUpEmail).
  function handleResendFollowUp() {
    if (!resendFollowUpAction || !guide) return;
    if (!confirm(`Resend the consultation follow-up email to ${guide.email}? This sends an additional copy - it will not change the original send's record.`)) return;
    setFollowUpError(null);
    setFollowUpMessage(null);
    startTransition(async () => {
      const result = await resendFollowUpAction(guide.id);
      if (result.error) setFollowUpError(result.error);
      else setFollowUpMessage(result.message ?? "Follow-up email resent.");
      router.refresh();
    });
  }

  // "Edit Email" save - persists Admin's corrected draft without sending
  // anything ("Admin must be able to review and edit the email before
  // sending"). Leaves edit mode on success so the saved text is visibly
  // what's now on file.
  function handleSaveFollowUpDraft() {
    if (!updateFollowUpDraftAction || !guide) return;
    setFollowUpError(null);
    setFollowUpMessage(null);
    startTransition(async () => {
      const result = await updateFollowUpDraftAction(guide.id, draftSubject, draftBody);
      if (result.error) {
        setFollowUpError(result.error);
        return;
      }
      setFollowUpMessage("Draft saved.");
      setIsEditingFollowUp(false);
      router.refresh();
    });
  }

  // Confirmed delete of this consultation record only - "Delete this
  // consultation record? This cannot be undone." On success, returns to
  // the list with a success message rather than showing one here, since
  // this page is gone once the record is.
  function handleDelete() {
    if (!guide || !deleteAction) return;
    if (!confirm("Delete this consultation record? This cannot be undone.")) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteAction(guide.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/admin/consultation-guide?deleted=${encodeURIComponent(guide.business_name || "Untitled consultation")}`);
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
          {guide && isCustomArrangementType(arrangementType) && (
            <span
              title={ARRANGEMENT_TYPE_LABELS[arrangementType]}
              className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700"
            >
              Custom Terms
            </span>
          )}
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

      {guide && (
        <p className="mt-1.5 text-[12px] text-slate-500">
          {updatedByName ? `Last updated by ${updatedByName} on ${new Date(guide.updated_at).toLocaleString()}` : `Last updated ${new Date(guide.updated_at).toLocaleString()}`}
        </p>
      )}

      {message && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{message}</p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
      )}
      {/* Follow-Up Email - "add a clearly visible Follow-Up Email section
          to each completed consultation." Shows the generated draft for
          review/edit; Send Email is the only action that ever sends it. */}
      {guide && guide.status === "completed" && guide.service && (
        <section className="mt-4 rounded-2xl border-2 border-sky-200 bg-sky-50/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-slate-900">Follow-Up Email</h2>
            <span
              title={guide.follow_up_email_error ?? guide.no_follow_up_email_reason ?? undefined}
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${CONSULTATION_GUIDE_FOLLOW_UP_STATUS_STYLES[guide.follow_up_email_status]}`}
            >
              {CONSULTATION_GUIDE_FOLLOW_UP_STATUS_LABELS[guide.follow_up_email_status]}
            </span>
          </div>

          {guide.follow_up_email_status === "sent" && guide.follow_up_email_sent_at && (
            <p className="mt-1 text-[12.5px] font-medium text-emerald-700">
              Sent {new Date(guide.follow_up_email_sent_at).toLocaleString()}
              {guide.follow_up_email_resend_count > 0 ? ` — resent ${guide.follow_up_email_resend_count}x since` : ""}
            </p>
          )}

          {followUpMessage && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700">{followUpMessage}</p>
          )}
          {followUpError && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{followUpError}</p>
          )}

          {!guide.email && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
              This prospect has no email address on file - add one above and save before sending.
            </p>
          )}

          {!guide.follow_up_email_subject || !guide.follow_up_email_body ? (
            <p className="mt-3 text-[12.5px] text-slate-500">No email draft has been generated for this consultation yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recipient Email</span>
                <p className="mt-0.5 text-[13.5px] font-medium text-slate-800">{guide.email ?? "—"}</p>
              </div>

              {isEditingFollowUp ? (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email Subject</span>
                    <input
                      type="text"
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      className={inputClasses}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email Body</span>
                    <textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      className={`${inputClasses} min-h-[220px] resize-y font-sans`}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleSaveFollowUpDraft}
                      className="rounded-[10px] bg-[var(--crm-accent,#3e7ef7)] px-3.5 py-2 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setDraftSubject(guide.follow_up_email_subject ?? "");
                        setDraftBody(guide.follow_up_email_body ?? "");
                        setIsEditingFollowUp(false);
                      }}
                      className="rounded-[10px] border border-slate-300 bg-white px-3.5 py-2 text-[12.5px] font-bold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email Subject</span>
                    <p className="mt-0.5 text-[13.5px] font-semibold text-slate-900">{guide.follow_up_email_subject}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email Body / Preview</span>
                    <pre className="mt-0.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 font-sans text-[12.5px] leading-relaxed text-slate-700">
                      {guide.follow_up_email_body}
                    </pre>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {updateFollowUpDraftAction && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setDraftSubject(guide.follow_up_email_subject ?? "");
                          setDraftBody(guide.follow_up_email_body ?? "");
                          setIsEditingFollowUp(true);
                        }}
                        className="rounded-[10px] border border-slate-300 bg-white px-3.5 py-2 text-[12.5px] font-bold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Edit Email
                      </button>
                    )}
                    {guide.email && guide.follow_up_email_status !== "sent" && sendFollowUpAction && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleSendFollowUp}
                        className={`rounded-[10px] border px-3.5 py-2 text-[12.5px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          guide.follow_up_email_status === "failed"
                            ? "border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400"
                            : "border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {guide.follow_up_email_status === "failed" ? "Retry Send Email" : "Send Email"}
                      </button>
                    )}
                    {guide.email && guide.follow_up_email_status === "sent" && resendFollowUpAction && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleResendFollowUp}
                        className="rounded-[10px] border border-slate-300 bg-white px-3.5 py-2 text-[12.5px] font-bold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Resend Email
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
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
            <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] font-semibold text-amber-900">
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

          {/* 9. Commercial Arrangement / Special Terms */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>9. Commercial Arrangement / Special Terms</h2>
            <div className="mt-4">
              <span className={labelClasses}>Arrangement Type</span>
              <select
                name="arrangement_type"
                value={arrangementType}
                onChange={(e) => setArrangementType(e.target.value as ArrangementType)}
                className={`${inputClasses} mt-1.5 sm:max-w-xs`}
              >
                {ARRANGEMENT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {ARRANGEMENT_TYPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>

            {arrangementType !== "standard_monthly" && (
              <div className="mt-5 space-y-4 border-t border-slate-200 pt-5">
                {isSplitPayment && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className={labelClasses}>Total Agreed Service Value</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-semibold text-slate-500">$</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          name="arrangement_total_value"
                          defaultValue={guide?.arrangement_total_value ?? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_total_value}
                          className={inputClasses}
                        />
                      </div>
                    </label>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClasses}>{isSplitPayment ? "Renewal / Ongoing Monthly Rate" : "Standard Winsalot Fee"}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold text-slate-500">$</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        name="arrangement_standard_fee"
                        defaultValue={
                          guide?.arrangement_standard_fee ??
                          (isSplitPayment ? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_standard_fee : PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_standard_fee)
                        }
                        className={inputClasses}
                      />
                    </div>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClasses}>{isSplitPayment ? "Upfront Deposit" : "Upfront Payment"}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold text-slate-500">$</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        name="arrangement_upfront_payment"
                        defaultValue={
                          guide?.arrangement_upfront_payment ??
                          (isSplitPayment ? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_upfront_payment : PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_upfront_payment)
                        }
                        className={inputClasses}
                      />
                    </div>
                  </label>
                  {isSplitPayment && (
                    <>
                      <label className="flex flex-col gap-1.5">
                        <span className={labelClasses}>First Milestone Amount</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13.5px] font-semibold text-slate-500">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            name="arrangement_milestone_1_amount"
                            defaultValue={guide?.arrangement_milestone_1_amount ?? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_milestone_1_amount}
                            className={inputClasses}
                          />
                        </div>
                      </label>
                      <Field
                        label="First Milestone Condition"
                        name="arrangement_milestone_1_condition"
                        defaultValue={guide?.arrangement_milestone_1_condition ?? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_milestone_1_condition}
                      />
                      <label className="flex flex-col gap-1.5">
                        <span className={labelClasses}>Second Milestone Amount</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13.5px] font-semibold text-slate-500">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            name="arrangement_milestone_2_amount"
                            defaultValue={guide?.arrangement_milestone_2_amount ?? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_milestone_2_amount}
                            className={inputClasses}
                          />
                        </div>
                      </label>
                      <Field
                        label="Second Milestone Condition"
                        name="arrangement_milestone_2_condition"
                        defaultValue={guide?.arrangement_milestone_2_condition ?? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_milestone_2_condition}
                      />
                    </>
                  )}
                  <Field
                    label={isSplitPayment ? "Conversion Definition" : "Payment Trigger"}
                    name="arrangement_payment_trigger"
                    defaultValue={
                      guide?.arrangement_payment_trigger ??
                      (isSplitPayment ? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_payment_trigger : PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_payment_trigger)
                    }
                  />
                  {!isSplitPayment && (
                    <Field
                      label="Attribution Period"
                      name="arrangement_attribution_period"
                      defaultValue={guide?.arrangement_attribution_period ?? PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_attribution_period}
                    />
                  )}
                  <Field
                    label="Service"
                    name="arrangement_service"
                    defaultValue={guide?.arrangement_service ?? (isSplitPayment ? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_service : PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_service)}
                  />
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClasses}>Campaign Status</span>
                    <select
                      name="arrangement_campaign_status"
                      defaultValue={guide?.arrangement_campaign_status ?? PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_campaign_status}
                      className={inputClasses}
                    >
                      {ARRANGEMENT_CAMPAIGN_STATUSES.map((option) => (
                        <option key={option} value={option}>
                          {ARRANGEMENT_CAMPAIGN_STATUS_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Campaign Start Date"
                    name="arrangement_campaign_start_date"
                    type="date"
                    defaultValue={guide?.arrangement_campaign_start_date ?? ""}
                  />
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClasses}>Conversion Status</span>
                    <select
                      name="arrangement_conversion_status"
                      defaultValue={guide?.arrangement_conversion_status ?? PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_conversion_status}
                      className={inputClasses}
                    >
                      {ARRANGEMENT_CONVERSION_STATUSES.map((option) => (
                        <option key={option} value={option}>
                          {ARRANGEMENT_CONVERSION_STATUS_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClasses}>Fee Status</span>
                    <select
                      name="arrangement_fee_status"
                      defaultValue={guide?.arrangement_fee_status ?? PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_fee_status}
                      className={inputClasses}
                    >
                      {ARRANGEMENT_FEE_STATUSES.map((option) => (
                        <option key={option} value={option}>
                          {ARRANGEMENT_FEE_STATUS_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>Client Services Being Promoted</span>
                  <textarea
                    name="arrangement_client_services"
                    placeholder="Example: Website Design, Website Redesign & Rebranding"
                    defaultValue={guide?.arrangement_client_services ?? ""}
                    className={`${inputClasses} min-h-[60px] resize-y`}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className={labelClasses}>{isSplitPayment ? "Additional Commercial Notes" : "Special Terms"}</span>
                  <textarea
                    name="arrangement_special_terms"
                    defaultValue={
                      guide?.arrangement_special_terms ??
                      (isSplitPayment ? CUSTOM_SPLIT_PAYMENT_DEFAULTS.arrangement_special_terms : PERFORMANCE_BASED_TRIAL_DEFAULTS.arrangement_special_terms)
                    }
                    className={`${inputClasses} min-h-[70px] resize-y`}
                  />
                </label>

                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] font-semibold text-amber-900">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Internal Only — Never sent to clients</p>
                  <p className="mt-1">{ARRANGEMENT_INTERNAL_COMPLIANCE_NOTE}</p>
                </div>
              </div>
            )}
          </section>

          {/* 10. Close the Consultation */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>10. Close the Consultation</h2>
            <p className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-[13.5px] italic text-sky-900">
              &ldquo;{CONSULTATION_GUIDE_CLOSING_LINE}&rdquo;
            </p>
          </section>

          {/* 11. Final Checklist */}
          <section className={sectionClasses}>
            <h2 className={sectionHeadingClasses}>11. Final Checklist</h2>
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
              defaultValue={val("notes") ?? ""}
              className={`${inputClasses} mt-3 min-h-[120px] resize-y`}
            />
          </section>
        </div>

        <div className="mt-6 flex flex-wrap gap-2.5">
          {guide && guide.status === "completed" ? (
            // A completed consultation is edited, never re-completed or
            // re-drafted - "Saving edits must not reopen the appointment
            // or resend any email." This is the one Save button available
            // here; it always calls the same plain saveAction as "Save
            // Consultation"/"Save as Draft" do below (status untouched).
            <button
              type="button"
              disabled={isPending}
              onClick={() => runSave("Changes saved.", saveAction)}
              className="rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Changes
            </button>
          ) : (
            <>
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
            </>
          )}
          {!(guide && guide.status === "completed") && (
            <button
              type="button"
              disabled={isPending}
              onClick={openCompleteModal}
              className="rounded-[11px] bg-emerald-600 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mark Consultation Complete
            </button>
          )}
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

      {guide && deleteAction && (
        <div className="mt-8 border-t border-slate-200 pt-4 text-center">
          <button
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="text-[12.5px] font-semibold text-rose-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete consultation
          </button>
        </div>
      )}

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
                A follow-up email draft will be generated and saved for review — it is <span className="font-semibold">not</span> sent
                automatically. You can review, edit, and send it yourself afterward from the Follow-Up Email section.
              </p>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
                This prospect has no email address on file. You can still complete this consultation - no follow-up email draft will be
                generated until an email address is added and saved.
              </p>
            )}

            {completePreview.recipientEmail && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Draft Preview — Subject</p>
                <p className="mt-0.5 text-[13.5px] font-semibold text-slate-900">{completePreview.subject}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Draft Preview — Body</p>
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
                Complete Consultation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
