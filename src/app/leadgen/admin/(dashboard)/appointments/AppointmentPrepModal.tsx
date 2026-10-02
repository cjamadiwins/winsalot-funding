"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import LargeModal from "@/components/crm-ui/LargeModal";
import OpportunitySnapshot from "@/components/leadgen/appointment-prep/OpportunitySnapshot";
import MeetingGuide from "@/components/leadgen/appointment-prep/MeetingGuide";
import { FeedbackStatusBadge, PrepStatusBadge } from "@/components/leadgen/appointment-prep/PrepStatusBadge";
import {
  BRIEF_LIMITS,
  INTEREST_LEVELS,
  MAX_SUGGESTED_QUESTIONS,
  MAX_TALKING_POINTS,
  NEXT_STEP_OPTIONS,
  OPPORTUNITY_QUALITY_STYLES,
  PRIMARY_OPPORTUNITY_SUGGESTIONS,
  RECOMMENDED_OBJECTIVES,
  generateClientBrief,
  parseLineList,
  type PrepStatus,
} from "@/lib/leadgen-appointment-prep";
import { LEADGEN_EMAIL_STATUS_LABELS, LEADGEN_EMAIL_STATUS_STYLES, type LeadgenEmailStatus } from "@/lib/leadgen-types";
import AppointmentBriefEmailModal from "./AppointmentBriefEmailModal";
import {
  loadAppointmentPrepAction,
  previewAppointmentBriefEmailAction,
  saveAppointmentBriefAction,
  saveFeedbackAdminNoteAction,
  sendAppointmentBriefAction,
  sendFeedbackRequestAction,
  type AppointmentPrepData,
  type BriefEmailPreview,
  type BriefFormInput,
} from "./prep-actions";

// Fields the generated client summary is built from.
const SUMMARY_SOURCE_KEYS = ["why_interested", "primary_opportunity", "main_interest", "primary_need", "recommended_objective"] as const;

function generateSummary(form: BriefFormInput, businessName: string) {
  return generateClientBrief({
    businessName,
    whyInterested: form.why_interested,
    primaryOpportunity: form.primary_opportunity,
    mainInterest: form.main_interest,
    primaryNeed: form.primary_need,
    recommendedObjective: form.recommended_objective,
  });
}

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function toForm(data: AppointmentPrepData): BriefFormInput {
  const brief = data.brief;
  return {
    why_interested: brief?.why_interested ?? "",
    primary_opportunity: brief?.primary_opportunity ?? "",
    main_interest: brief?.main_interest ?? "",
    primary_need: brief?.primary_need ?? "",
    interest_level: brief?.interest_level ?? "",
    recommended_objective: brief?.recommended_objective ?? "",
    appointment_summary: brief?.appointment_summary ?? "",
    talking_points: (brief?.talking_points ?? []).join("\n"),
    suggested_questions: (brief?.suggested_questions ?? []).join("\n"),
    recommended_next_step: brief?.recommended_next_step ?? "",
    next_step_note: brief?.next_step_note ?? "",
    admin_note: data.adminNote?.prep_note ?? "",
  };
}

export default function AppointmentPrepModal({ appointmentId, onClose }: { appointmentId: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<AppointmentPrepData | null>(null);
  const [form, setForm] = useState<BriefFormInput | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [status, setStatus] = useState<PrepStatus>("brief_not_prepared");
  // True while the client summary is auto-managed (generated from the fields
  // and not yet edited by hand). Editing the text switches it off; the
  // "Regenerate" button switches it back on. Generation only fills the text -
  // nothing is saved or sent until Admin presses Save Brief / Send.
  const [summaryAuto, setSummaryAuto] = useState(false);
  const [emailPreview, setEmailPreview] = useState<BriefEmailPreview | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadAppointmentPrepAction(appointmentId).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setMessage({ kind: "error", text: result.error ?? "Failed to load the appointment." });
        return;
      }
      setData(result.data);
      const initial = toForm(result.data);
      const auto = !initial.appointment_summary.trim();
      if (auto) initial.appointment_summary = generateSummary(initial, result.data.appointment.business_name).summary;
      setSummaryAuto(auto);
      setForm(initial);
      setFeedbackNote(result.data.adminNote?.feedback_note ?? "");
      setStatus(result.data.brief?.prep_status ?? "brief_not_prepared");
    });
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  function set<K extends keyof BriefFormInput>(key: K, value: BriefFormInput[K]) {
    setForm((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (summaryAuto && data && (SUMMARY_SOURCE_KEYS as readonly string[]).includes(key)) {
        next.appointment_summary = generateSummary(next, data.appointment.business_name).summary;
      }
      return next;
    });
  }

  function regenerateSummary() {
    if (!form || !data) return;
    const generatedText = generateSummary(form, data.appointment.business_name).summary;
    if (form.appointment_summary.trim() && form.appointment_summary.trim() !== generatedText && !window.confirm("Replace the current client summary with a freshly generated one? Your edits to it will be lost.")) return;
    setForm({ ...form, appointment_summary: generatedText });
    setSummaryAuto(true);
  }

  // "Send Appointment Brief" only opens the review step - it never sends.
  function openEmailPreview() {
    if (!form) return;
    setMessage(null);
    startTransition(async () => {
      const result = await previewAppointmentBriefEmailAction(appointmentId, form);
      if (result.error || !result.preview) {
        setMessage({ kind: "error", text: result.error ?? "Could not prepare the email." });
        return;
      }
      setEmailPreview(result.preview);
    });
  }

  async function confirmSend(email: { subject: string; body: string }): Promise<{ error?: string }> {
    if (!form) return { error: "Form not loaded." };
    const result = await sendAppointmentBriefAction(appointmentId, form, email);
    if (result.prepStatus) setStatus(result.prepStatus);
    if (result.error) return { error: result.error };
    setEmailPreview(null);
    setMessage({ kind: "ok", text: result.message ?? "Brief sent." });
    // Re-load so the Appointment Brief Emails list shows the real send/delivery status.
    const refreshed = await loadAppointmentPrepAction(appointmentId);
    if (refreshed.data) setData(refreshed.data);
    router.refresh();
    return {};
  }

  function run(action: () => Promise<{ error?: string; message?: string; prepStatus?: PrepStatus }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        if (result.prepStatus) setStatus(result.prepStatus);
        return;
      }
      if (result.prepStatus) setStatus(result.prepStatus);
      setMessage({ kind: "ok", text: result.message ?? "Saved." });
      router.refresh();
    });
  }

  const appt = data?.appointment;
  const talkingCount = form ? parseLineList(form.talking_points, 50).length : 0;
  const questionCount = form ? parseLineList(form.suggested_questions, 50).length : 0;
  const nextStepIsCustom = form ? form.recommended_next_step !== "" && !(NEXT_STEP_OPTIONS as readonly string[]).includes(form.recommended_next_step) : false;
  const feedback = data?.feedback ?? null;

  return (
    <>
    <LargeModal
      open
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      labelledBy="appointment-prep-title"
      headerLeft={
        <div className="min-w-0">
          <h2 id="appointment-prep-title" className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
            Prepare Appointment
            {data && <PrepStatusBadge status={status} />}
            {data?.feedbackStatus && <FeedbackStatusBadge status={data.feedbackStatus} />}
          </h2>
          {appt && (
            <p className="mt-0.5 truncate text-[12.5px] text-slate-500">
              {appt.business_name} · {appt.appointment_date} {appt.appointment_time}
            </p>
          )}
        </div>
      }
      footer={
        form && appt ? (
          <>
            <p className={`min-w-0 text-[12.5px] ${message?.kind === "error" ? "text-rose-700" : "text-emerald-700"}`}>{message?.text ?? ""}</p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => saveAppointmentBriefAction(appointmentId, form))}
                className="rounded-full border border-slate-300 px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save Brief"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={openEmailPreview}
                className="rounded-full bg-sky-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {status === "sent_to_client" || status === "client_viewed" ? "Re-send Appointment Brief" : "Send Appointment Brief"}
              </button>
            </div>
          </>
        ) : undefined
      }
    >
      {!data || !form || !appt ? (
        <p className={`py-8 text-center text-sm ${message?.kind === "error" ? "text-rose-700" : "text-slate-500"}`}>{message?.text ?? "Loading…"}</p>
      ) : (
        <div className="space-y-3 pb-1 text-[13px]">
          {/* Overview - references the existing lead/appointment records. */}
          <section className="rounded-xl bg-slate-50 px-3 py-2">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {[
                ["Prospect", appt.business_name],
                ["Contact", appt.contact_name],
                ["Phone", appt.phone],
                ["Email", appt.email],
                ["Website", data.lead?.website],
                ["Industry", data.lead?.industry],
                ["Date / Time", `${appt.appointment_date} ${appt.appointment_time} (${appt.timezone})`],
                ["Agent", data.agentName],
                ["Client", data.clientName],
                ["Campaign", data.campaignName],
              ].map(([label, value]) => (
                <div key={label as string} className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-400">{label}</dt>
                  <dd className="min-w-0 break-words font-medium text-slate-800">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Why This Prospect Is Interested</span>
              <textarea
                rows={2}
                maxLength={600}
                value={form.why_interested}
                onChange={(e) => set("why_interested", e.target.value)}
                placeholder="e.g. The owner is interested in improving the website and generating more customer inquiries."
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Primary Opportunity</span>
              <input list="prep-opportunities" value={form.primary_opportunity} onChange={(e) => set("primary_opportunity", e.target.value)} maxLength={120} className={inputClass} />
              <datalist id="prep-opportunities">
                {PRIMARY_OPPORTUNITY_SUGGESTIONS.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Interest Level</span>
              <select value={form.interest_level} onChange={(e) => set("interest_level", e.target.value)} className={inputClass}>
                <option value="">Not set</option>
                {INTEREST_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Recommended Objective</span>
              <input list="prep-objectives" value={form.recommended_objective} onChange={(e) => set("recommended_objective", e.target.value)} maxLength={BRIEF_LIMITS.objective} className={inputClass} />
              <datalist id="prep-objectives">
                {RECOMMENDED_OBJECTIVES.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Main Interest</span>
              <input value={form.main_interest} onChange={(e) => set("main_interest", e.target.value)} maxLength={BRIEF_LIMITS.interest} placeholder="e.g. Website Redesign / SEO" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Primary Need</span>
              <input value={form.primary_need} onChange={(e) => set("primary_need", e.target.value)} maxLength={BRIEF_LIMITS.need} placeholder="What the prospect needs to accomplish" className={inputClass} />
            </label>
          </div>

          <OpportunitySnapshot interestLevel={form.interest_level || null} primaryNeed={form.primary_need || form.primary_opportunity || null} objective={form.recommended_objective || null} />

          {/* SDR call notes: existing history, read-only. */}
          <details className="rounded-xl border border-slate-200 bg-white px-3 py-2" open={data.callNotes.length > 0 && !form.appointment_summary}>
            <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-700">SDR Call Notes ({data.callNotes.length})</summary>
            {data.callNotes.length === 0 ? (
              <p className="mt-1.5 text-slate-500">No call notes on file for this lead.</p>
            ) : (
              <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto">
                {data.callNotes.map((note) => (
                  <li key={note.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12.5px] text-slate-700">
                    <span className="text-[11px] text-slate-400">
                      {formatDateTime(note.occurred_at)}
                      {note.call_outcome ? ` · ${note.call_outcome}` : ""}
                    </span>
                    <span className="block whitespace-pre-line">{note.notes}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="prep-summary" className={labelClass}>
                Appointment Summary for Client (the original call history is never changed)
              </label>
              <button type="button" onClick={regenerateSummary} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50">
                {form.appointment_summary.trim() ? "Regenerate from fields" : "Generate from fields"}
              </button>
            </div>
            <textarea
              id="prep-summary"
              rows={6}
              maxLength={BRIEF_LIMITS.summary}
              value={form.appointment_summary}
              onChange={(e) => {
                setSummaryAuto(false);
                setForm({ ...form, appointment_summary: e.target.value });
              }}
              className={inputClass}
            />
            {(() => {
              const generated = generateSummary(form, appt.business_name);
              if (!generated.canGenerate) {
                return <p className="text-[11.5px] text-amber-700">Needs additional information to generate a client summary — add: {generated.missing.join(", ")}.</p>;
              }
              return (
                <p className={`text-[11.5px] ${generated.missing.length ? "text-amber-700" : "text-slate-400"}`}>
                  {summaryAuto ? "Auto-generated from the fields above — review and edit before saving. " : "Edited by hand. "}
                  {generated.missing.length ? `Still missing: ${generated.missing.join(", ")}.` : ""}
                </p>
              );
            })()}
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>
              Recommended Talking Points · one per line ({talkingCount}/{MAX_TALKING_POINTS})
            </span>
            <textarea
              rows={4}
              value={form.talking_points}
              onChange={(e) => set("talking_points", e.target.value)}
              placeholder={"Ask what they currently dislike about their website.\nUnderstand how most customers currently find them."}
              className={inputClass}
            />
          </label>

          <details className="rounded-xl border border-slate-200 bg-white px-3 py-2" open={questionCount > 0}>
            <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-700">
              Suggested Questions ({questionCount}/{MAX_SUGGESTED_QUESTIONS})
            </summary>
            <textarea
              rows={5}
              value={form.suggested_questions}
              onChange={(e) => set("suggested_questions", e.target.value)}
              placeholder={"What would you most like to improve about your current website?\nDoes your website currently generate customer inquiries?"}
              className={`${inputClass} mt-1.5`}
            />
            <p className="mt-1 text-[11.5px] text-slate-400">One question per line; editable per client service.</p>
          </details>

          <MeetingGuide />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Recommended Next Step</span>
              <select
                value={nextStepIsCustom ? "Custom" : form.recommended_next_step}
                onChange={(e) => set("recommended_next_step", e.target.value === "Custom" ? "Custom" : e.target.value)}
                className={inputClass}
              >
                <option value="">Not set</option>
                {NEXT_STEP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {(nextStepIsCustom || form.recommended_next_step === "Custom") && (
                <input
                  value={form.recommended_next_step === "Custom" ? "" : form.recommended_next_step}
                  onChange={(e) => set("recommended_next_step", e.target.value || "Custom")}
                  placeholder="Describe the custom next step"
                  maxLength={120}
                  className={inputClass}
                />
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Short Note (optional, client-visible)</span>
              <input value={form.next_step_note} onChange={(e) => set("next_step_note", e.target.value)} maxLength={300} className={inputClass} />
            </label>
          </div>

          <label className="flex flex-col gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
            <span className={labelClass}>Internal Admin Note · never shown to the client</span>
            <textarea rows={2} maxLength={1000} value={form.admin_note} onChange={(e) => set("admin_note", e.target.value)} className={inputClass} />
          </label>

          {/* Appointment Brief emails already sent - real delivery status */}
          <section className="rounded-xl border border-slate-200 px-3 py-2">
            <h3 className="text-[12.5px] font-bold text-slate-800">Appointment Brief Emails</h3>
            {data.emailHistory.length === 0 ? (
              <p className="mt-1 text-[12.5px] text-slate-500">Not sent yet. Sending is always a manual step.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {data.emailHistory.map((email) => {
                  const reason = email.status === "failed" ? email.failure_reason : email.status === "bounced" ? email.bounce_reason : null;
                  const emailStatus = email.status as LeadgenEmailStatus;
                  return (
                    <li key={email.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                      <span className="min-w-0 break-words text-slate-700">
                        {formatDateTime(email.sent_at ?? email.created_at)} · {email.to_email}
                        {reason ? <span className="block text-[11.5px] text-rose-600">{reason}</span> : null}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[emailStatus] ?? "bg-slate-100 text-slate-700"}`}>
                        {LEADGEN_EMAIL_STATUS_LABELS[emailStatus] ?? email.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Post-appointment feedback summary */}
          <section className="rounded-xl border border-slate-200 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[12.5px] font-bold text-slate-800">Client Feedback</h3>
              {data.feedbackStatus && <FeedbackStatusBadge status={data.feedbackStatus} />}
            </div>
            {feedback ? (
              <dl className="mt-1.5 space-y-0.5 text-[12.5px]">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-400">Outcome</dt>
                  <dd className="font-medium text-slate-800">
                    {feedback.outcome}
                    {feedback.what_happened ? ` — ${feedback.what_happened}` : ""}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-400">Quality</dt>
                  <dd>
                    {feedback.opportunity_quality ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OPPORTUNITY_QUALITY_STYLES[feedback.opportunity_quality]}`}>{feedback.opportunity_quality}</span>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-400">Qualification</dt>
                  <dd className="text-slate-800">{feedback.fit_issues.length ? feedback.fit_issues.join(", ") : "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-400">Client notes</dt>
                  <dd className="text-slate-800">{feedback.future_notes || "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-400">Submitted</dt>
                  <dd className="text-slate-800">{formatDateTime(feedback.submitted_at)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1 text-[12.5px] text-slate-500">
                {data.feedbackStatus === "feedback_pending" ? "The appointment has passed and no feedback has been submitted yet." : "Feedback opens once the appointment has taken place."}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {feedback && (
                <>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={labelClass}>Internal note · never shown to the client</span>
                    <input value={feedbackNote} onChange={(e) => setFeedbackNote(e.target.value)} maxLength={1000} className={inputClass} />
                  </label>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => saveFeedbackAdminNoteAction(appointmentId, feedbackNote))}
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Save Note
                  </button>
                </>
              )}
              {data.feedbackStatus === "feedback_pending" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => sendFeedbackRequestAction(appointmentId))}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Send Feedback Request
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </LargeModal>
    {emailPreview && (
      <AppointmentBriefEmailModal
        preview={emailPreview}
        resend={status === "sent_to_client" || status === "client_viewed"}
        onCancel={() => setEmailPreview(null)}
        onSend={confirmSend}
      />
    )}
    </>
  );
}
