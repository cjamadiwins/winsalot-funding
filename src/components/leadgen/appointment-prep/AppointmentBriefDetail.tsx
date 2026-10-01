import type { LeadgenAppointmentRow } from "@/lib/leadgen-types";
import {
  OPPORTUNITY_QUALITY_STYLES,
  buildLifecycle,
  deriveFeedbackStatus,
  type AppointmentFeedbackRow,
  type ClientBriefView,
} from "@/lib/leadgen-appointment-prep";
import AppointmentLifecycle from "./AppointmentLifecycle";
import AppointmentFeedbackForm from "./AppointmentFeedbackForm";
import ClientBriefPanel from "./ClientBriefPanel";
import { FeedbackStatusBadge } from "./PrepStatusBadge";

type FeedbackSubmit = (input: { outcome: string; what_happened: string; opportunity_quality: string; fit_issues: string[]; future_notes: string }) => Promise<{ error?: string; message?: string }>;

// Shared client-facing appointment view: used by the real Client Portal
// (readOnly = false) and by the Admin "Preview as Client" page (readOnly =
// true, no feedback writes). Everything here is client-safe by
// construction - it only receives the client brief view, the appointment the
// client owns, and the client's own feedback.
export default function AppointmentBriefDetail({
  appointment,
  brief,
  feedback,
  overview,
  submitFeedback,
  readOnly = false,
}: {
  appointment: LeadgenAppointmentRow;
  brief: ClientBriefView | null;
  feedback: AppointmentFeedbackRow | null;
  overview: { contactName: string | null; phone: string | null; email: string | null; website: string | null; industry: string | null };
  submitFeedback?: FeedbackSubmit;
  readOnly?: boolean;
}) {
  const feedbackStatus = deriveFeedbackStatus(appointment, feedback);
  const lifecycle = buildLifecycle(appointment, brief?.prep_status ?? null, feedback);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{appointment.business_name}</h2>
            <p className="text-[12.5px] text-slate-500">
              {appointment.appointment_date} {appointment.appointment_time} ({appointment.timezone}) · {appointment.meeting_type}
            </p>
          </div>
          {feedbackStatus && <FeedbackStatusBadge status={feedbackStatus} />}
        </div>
        <div className="mt-2">
          <AppointmentLifecycle steps={lifecycle} />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4">
        <h2 className="text-[14px] font-bold text-slate-900">Appointment Brief</h2>
        <div className="mt-2">
          {brief ? (
            <ClientBriefPanel brief={brief} overview={{ businessName: appointment.business_name, ...overview }} />
          ) : (
            <p className="text-[13px] text-slate-500">Winsalot Corp. is preparing your brief for this appointment. You&apos;ll be emailed when it&apos;s ready.</p>
          )}
        </div>
      </section>

      {feedbackStatus && (
        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4">
          <h2 className="text-[14px] font-bold text-slate-900">{feedback ? "Your Appointment Feedback" : "How did the appointment go?"}</h2>
          {feedback && (
            <p className="mt-1 text-[13px] text-slate-700">
              <span className="font-semibold">{feedback.outcome}</span>
              {feedback.opportunity_quality && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${OPPORTUNITY_QUALITY_STYLES[feedback.opportunity_quality]}`}>{feedback.opportunity_quality}</span>
              )}
              {feedback.what_happened ? <span className="block text-slate-600">{feedback.what_happened}</span> : null}
            </p>
          )}
          <div className="mt-2">
            {readOnly || !submitFeedback ? (
              <p className="text-[12.5px] text-slate-400">Preview only - feedback is submitted by the client.</p>
            ) : (
              <AppointmentFeedbackForm existing={feedback} submitAction={submitFeedback} defaultOpen={false} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
