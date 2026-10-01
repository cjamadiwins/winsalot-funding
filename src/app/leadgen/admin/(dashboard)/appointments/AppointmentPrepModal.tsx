"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import LargeModal from "@/components/crm-ui/LargeModal";
import OpportunitySnapshot from "@/components/leadgen/appointment-prep/OpportunitySnapshot";
import MeetingGuide from "@/components/leadgen/appointment-prep/MeetingGuide";
import { FeedbackStatusBadge, PrepStatusBadge } from "@/components/leadgen/appointment-prep/PrepStatusBadge";
import {
  INTEREST_LEVELS,
  MAX_SUGGESTED_QUESTIONS,
  MAX_TALKING_POINTS,
  NEXT_STEP_OPTIONS,
  OPPORTUNITY_QUALITY_STYLES,
  PRIMARY_OPPORTUNITY_SUGGESTIONS,
  RECOMMENDED_OBJECTIVES,
  parseLineList,
  type PrepStatus,
} from "@/lib/leadgen-appointment-prep";
import {
  loadAppointmentPrepAction,
  saveAppointmentBriefAction,
  saveFeedbackAdminNoteAction,
  sendAppointmentBriefAction,
  sendFeedbackRequestAction,
  type AppointmentPrepData,
  type BriefFormInput,
} from "./prep-actions";

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
      setForm(toForm(result.data));
      setFeedbackNote(result.data.adminNote?.feedback_note ?? "");
      setStatus(result.data.brief?.prep_status ?? "brief_not_prepared");
    });
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  function set<K extends keyof BriefFormInput>(key: K, value: BriefFormInput[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
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
                onClick={() => {
                  if (!window.confirm(`Save and email this brief to ${data?.recipients.join(", ") || "the client"}?`)) return;
                  run(() => sendAppointmentBriefAction(appointmentId, form));
                }}
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
              <span className={labelClass}>Prospect Interest</span>
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
              <input list="prep-objectives" value={form.recommended_objective} onChange={(e) => set("recommended_objective", e.target.value)} maxLength={160} className={inputClass} />
              <datalist id="prep-objectives">
                {RECOMMENDED_OBJECTIVES.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
          </div>

          <OpportunitySnapshot interestLevel={form.interest_level || null} primaryNeed={form.primary_opportunity || null} objective={form.recommended_objective || null} />

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
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Appointment Summary for Client (the original call history is never changed)</span>
            <textarea rows={2} maxLength={800} value={form.appointment_summary} onChange={(e) => set("appointment_summary", e.target.value)} className={inputClass} />
          </label>

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
  );
}
