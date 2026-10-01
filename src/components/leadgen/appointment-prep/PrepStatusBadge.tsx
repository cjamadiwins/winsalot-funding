import { FEEDBACK_STATUS_LABELS, FEEDBACK_STATUS_STYLES, PREP_STATUS_LABELS, PREP_STATUS_STYLES, type FeedbackStatus, type PrepStatus } from "@/lib/leadgen-appointment-prep";

export function PrepStatusBadge({ status }: { status: PrepStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PREP_STATUS_STYLES[status]}`}>{PREP_STATUS_LABELS[status]}</span>;
}

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${FEEDBACK_STATUS_STYLES[status]}`}>{FEEDBACK_STATUS_LABELS[status]}</span>;
}
