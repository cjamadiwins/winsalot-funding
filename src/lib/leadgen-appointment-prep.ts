// Client Appointment Preparation + Post-Appointment Feedback: shared,
// framework-agnostic types, option lists and pure helpers for the Lead Gen
// CRM. Deliberately free of "server-only"/Supabase imports so the Admin
// modal, the Client Portal pages and the unit tests can all use one
// definition (migration 20261001010000).
//
// The preparation status and the feedback status are their own concepts -
// neither ever reads or writes leadgen_appointments.status.

// ---------------------------------------------------------------------
// Preparation status
// ---------------------------------------------------------------------
export const PREP_STATUSES = ["brief_not_prepared", "brief_ready", "sent_to_client", "client_viewed"] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const PREP_STATUS_LABELS: Record<PrepStatus, string> = {
  brief_not_prepared: "Brief Not Prepared",
  brief_ready: "Brief Ready",
  sent_to_client: "Sent to Client",
  client_viewed: "Client Viewed",
};

export const PREP_STATUS_STYLES: Record<PrepStatus, string> = {
  brief_not_prepared: "bg-amber-100 text-amber-800",
  brief_ready: "bg-sky-100 text-sky-800",
  sent_to_client: "bg-indigo-100 text-indigo-800",
  client_viewed: "bg-emerald-100 text-emerald-800",
};

// ---------------------------------------------------------------------
// Option lists (all editable/overridable by Admin where "Custom" applies)
// ---------------------------------------------------------------------
export const INTEREST_LEVELS = ["High", "Medium", "Early Interest"] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

export const PRIMARY_OPPORTUNITY_SUGGESTIONS = [
  "Website redesign",
  "Website improvement",
  "Lead generation",
  "SEO",
  "E-commerce",
  "Branding",
  "Online visibility",
  "Business funding",
] as const;

export const RECOMMENDED_OBJECTIVES = [
  "Understand project scope",
  "Secure a proposal opportunity",
  "Schedule a website audit",
  "Book a second consultation",
  "Obtain required information",
  "Discuss pricing / next steps",
] as const;

export const NEXT_STEP_OPTIONS = [
  "Send Proposal",
  "Send Quote",
  "Schedule Follow-Up",
  "Website Audit",
  "Collect Documents",
  "Product Demo",
  "Second Consultation",
  "Close / Purchase Discussion",
  "Custom",
] as const;

export const MAX_TALKING_POINTS = 5;
export const MAX_SUGGESTED_QUESTIONS = 6;

export const MEETING_GUIDE = [
  { time: "0–2 min", title: "Introduction", text: "Build rapport and confirm the reason for the meeting." },
  { time: "2–7 min", title: "Discovery", text: "Understand the prospect’s situation, challenges, needs, and priorities." },
  { time: "7–12 min", title: "Solution", text: "Explain how your service could address those needs." },
  { time: "12–15 min", title: "Next Step", text: "Agree on the next action such as a quote, proposal, audit, follow-up meeting, or required documents." },
] as const;

// ---------------------------------------------------------------------
// Feedback option lists
// ---------------------------------------------------------------------
export const FEEDBACK_OUTCOMES = [
  "Great Opportunity",
  "Follow-Up Required",
  "Proposal / Quote Sent",
  "Second Meeting Booked",
  "Won / Became Customer",
  "Not Ready Yet",
  "Not Qualified",
  "No Show",
  "Rescheduled",
  "Other",
] as const;
export type FeedbackOutcome = (typeof FEEDBACK_OUTCOMES)[number];

export const OPPORTUNITY_QUALITIES = ["Strong", "Good", "Fair", "Poor"] as const;
export type OpportunityQuality = (typeof OPPORTUNITY_QUALITIES)[number];

export const OPPORTUNITY_QUALITY_STYLES: Record<OpportunityQuality, string> = {
  Strong: "bg-emerald-100 text-emerald-800",
  Good: "bg-sky-100 text-sky-800",
  Fair: "bg-amber-100 text-amber-800",
  Poor: "bg-rose-100 text-rose-800",
};

export const FIT_ISSUES = [
  "Wrong decision maker",
  "Not interested enough",
  "No current need",
  "Budget issue",
  "Timing issue",
  "Service mismatch",
  "Business too small",
  "Business too large",
  "Wrong location",
  "Duplicate / already contacted",
  "Could not reach prospect",
  "Other",
] as const;
export type FitIssue = (typeof FIT_ISSUES)[number];

// Informational wording for "Recent Client Preferences" - one fixed phrase
// per recorded fit issue, so a preference is only ever shown when clients
// actually recorded the matching issue. Never feeds any automation.
const FIT_ISSUE_PREFERENCES: Partial<Record<FitIssue, string>> = {
  "Wrong decision maker": "Prioritize decision makers",
  "Not interested enough": "Prefer prospects with clear interest",
  "No current need": "Businesses with an active need",
  "Budget issue": "Confirm budget before booking",
  "Timing issue": "Prospects ready to act soon",
  "Service mismatch": "Confirm the prospect wants this service",
  "Business too small": "Avoid businesses below the stated size threshold",
  "Business too large": "Avoid businesses above the stated size threshold",
  "Wrong location": "Prefer businesses within the selected service area",
  "Duplicate / already contacted": "Avoid prospects the client already contacted",
};

// Outcomes that mean the appointment did not move forward.
const NON_PROGRESSING_OUTCOMES: readonly FeedbackOutcome[] = ["Not Ready Yet", "Not Qualified", "No Show"];

// ---------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------
export type AppointmentBriefRow = {
  id: string;
  appointment_id: string;
  client_id: string;
  why_interested: string | null;
  primary_opportunity: string | null;
  interest_level: InterestLevel | null;
  recommended_objective: string | null;
  appointment_summary: string | null;
  talking_points: string[];
  suggested_questions: string[];
  recommended_next_step: string | null;
  next_step_note: string | null;
  prep_status: PrepStatus;
  prepared_by: string | null;
  sent_at: string | null;
  sent_by: string | null;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentFeedbackRow = {
  id: string;
  appointment_id: string;
  client_id: string;
  outcome: FeedbackOutcome;
  what_happened: string | null;
  opportunity_quality: OpportunityQuality | null;
  fit_issues: string[];
  future_notes: string | null;
  submitted_by: string | null;
  submitted_at: string;
  updated_at: string;
};

// The ONLY brief fields a client login ever receives (the portal never
// selects or forwards anything else, and internal notes live in a separate
// admin-only table). Prospect overview fields come from the appointment the
// client already owns.
export type ClientBriefView = {
  why_interested: string | null;
  primary_opportunity: string | null;
  interest_level: InterestLevel | null;
  recommended_objective: string | null;
  appointment_summary: string | null;
  talking_points: string[];
  suggested_questions: string[];
  recommended_next_step: string | null;
  next_step_note: string | null;
  prep_status: PrepStatus;
};

export function toClientBriefView(row: AppointmentBriefRow): ClientBriefView {
  return {
    why_interested: row.why_interested,
    primary_opportunity: row.primary_opportunity,
    interest_level: row.interest_level,
    recommended_objective: row.recommended_objective,
    appointment_summary: row.appointment_summary,
    talking_points: row.talking_points ?? [],
    suggested_questions: row.suggested_questions ?? [],
    recommended_next_step: row.recommended_next_step,
    next_step_note: row.next_step_note,
    prep_status: row.prep_status,
  };
}

// ---------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------
// Splits a textarea (one item per line) into trimmed, non-empty, de-bulleted
// items, capped at `max`.
export function parseLineList(value: string, max: number): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export function trimmedOrNull(value: unknown, maxLength = 1000): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

// A brief is "ready" once it has something a client can act on.
export function isBriefContentComplete(
  brief: Pick<ClientBriefView, "why_interested" | "primary_opportunity" | "talking_points" | "suggested_questions">
): boolean {
  return Boolean(brief.why_interested?.trim() && brief.primary_opportunity?.trim() && (brief.talking_points.length > 0 || brief.suggested_questions.length > 0));
}

// ---------------------------------------------------------------------
// Appointment timing
// ---------------------------------------------------------------------
type AppointmentTiming = { appointment_date: string; appointment_time: string; timezone: string; status?: string };

// "YYYY-MM-DD HH:mm" for `now` in the appointment's own timezone (falls back
// to UTC for an unrecognised zone) - compared as a plain string against the
// appointment's stored local date/time.
function localStamp(now: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function hasAppointmentPassed(appt: AppointmentTiming, now: Date = new Date()): boolean {
  if (appt.status === "Completed") return true;
  return `${appt.appointment_date} ${appt.appointment_time.slice(0, 5)}` <= localStamp(now, appt.timezone);
}

// Appointments that were never held and can never be prepared/reviewed.
const INACTIVE_APPOINTMENT_STATUSES = new Set(["Cancelled", "Replaced"]);
export function isPreparableAppointment(appt: { status: string }): boolean {
  return !INACTIVE_APPOINTMENT_STATUSES.has(appt.status);
}

// ---------------------------------------------------------------------
// Feedback status (separate from appointment + prep status)
// ---------------------------------------------------------------------
export type FeedbackStatus = "feedback_pending" | "feedback_received";
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  feedback_pending: "Feedback Pending",
  feedback_received: "Feedback Received",
};
export const FEEDBACK_STATUS_STYLES: Record<FeedbackStatus, string> = {
  feedback_pending: "bg-amber-100 text-amber-800",
  feedback_received: "bg-emerald-100 text-emerald-800",
};

// null while the appointment hasn't happened yet (or was cancelled).
export function deriveFeedbackStatus(appt: AppointmentTiming, feedback: { submitted_at: string } | null | undefined, now: Date = new Date()): FeedbackStatus | null {
  if (feedback) return "feedback_received";
  if (!isPreparableAppointment({ status: appt.status ?? "" })) return null;
  return hasAppointmentPassed(appt, now) ? "feedback_pending" : null;
}

// ---------------------------------------------------------------------
// Lifecycle (Client Portal): Booked -> Prepared -> Sent -> Viewed ->
// Completed -> Feedback
// ---------------------------------------------------------------------
export type LifecycleStep = { label: string; done: boolean };

export function buildLifecycle(appt: AppointmentTiming, prep: PrepStatus | null, feedback: unknown | null, now: Date = new Date()): LifecycleStep[] {
  const prepared = prep !== null && prep !== "brief_not_prepared";
  const sent = prep === "sent_to_client" || prep === "client_viewed";
  return [
    { label: "Booked", done: true },
    { label: "Brief Prepared", done: prepared },
    { label: "Brief Sent", done: sent },
    { label: "Client Viewed", done: prep === "client_viewed" },
    { label: "Completed", done: hasAppointmentPassed(appt, now) },
    { label: "Feedback", done: Boolean(feedback) },
  ];
}

// ---------------------------------------------------------------------
// Admin dashboard: compact preparation indicator
// ---------------------------------------------------------------------
export type PrepSummary = { ready: number; needsPreparation: number; sent: number; viewed: number };

// Counts upcoming, preparable appointments by prep status. `briefs` maps
// appointment id -> prep status (missing = Brief Not Prepared).
export function summarizePrep(
  appointments: Array<AppointmentTiming & { id: string }>,
  briefs: Record<string, PrepStatus | undefined>,
  now: Date = new Date()
): PrepSummary {
  const summary: PrepSummary = { ready: 0, needsPreparation: 0, sent: 0, viewed: 0 };
  for (const appt of appointments) {
    if (!isPreparableAppointment({ status: appt.status ?? "" }) || hasAppointmentPassed(appt, now)) continue;
    const status = briefs[appt.id] ?? "brief_not_prepared";
    if (status === "brief_not_prepared") summary.needsPreparation += 1;
    else if (status === "brief_ready") summary.ready += 1;
    else if (status === "sent_to_client") summary.sent += 1;
    else summary.viewed += 1;
  }
  return summary;
}

// ---------------------------------------------------------------------
// Reporting metrics (only counts what is recorded)
// ---------------------------------------------------------------------
export type FeedbackMetrics = {
  appointmentsCompleted: number;
  feedbackReceived: number;
  strongOrGood: number;
  followUpsRequired: number;
  proposalsOrQuotes: number;
  secondMeetings: number;
  customersWon: number;
  notQualified: number;
  noShows: number;
};

export function computeFeedbackMetrics(
  appointments: Array<AppointmentTiming & { id: string }>,
  feedback: Array<Pick<AppointmentFeedbackRow, "appointment_id" | "outcome" | "opportunity_quality">>
): FeedbackMetrics {
  const countable = appointments.filter((a) => isPreparableAppointment({ status: a.status ?? "" }));
  const ids = new Set(countable.map((a) => a.id));
  const rows = feedback.filter((f) => ids.has(f.appointment_id));
  const outcomeCount = (outcome: FeedbackOutcome) => rows.filter((f) => f.outcome === outcome).length;
  return {
    // Same definition the existing reports use: the appointment status.
    appointmentsCompleted: countable.filter((a) => a.status === "Completed").length,
    feedbackReceived: rows.length,
    strongOrGood: rows.filter((f) => f.opportunity_quality === "Strong" || f.opportunity_quality === "Good").length,
    followUpsRequired: outcomeCount("Follow-Up Required"),
    proposalsOrQuotes: outcomeCount("Proposal / Quote Sent"),
    secondMeetings: outcomeCount("Second Meeting Booked"),
    customersWon: outcomeCount("Won / Became Customer"),
    notQualified: outcomeCount("Not Qualified"),
    noShows: outcomeCount("No Show"),
  };
}

// ---------------------------------------------------------------------
// Appointment Quality Insights (Admin only) - plain counts of recorded
// feedback; nothing inferred.
// ---------------------------------------------------------------------
export type CountedLabel = { label: string; count: number };

export type QualityInsights = {
  feedbackCount: number;
  topFitIssues: CountedLabel[];
  nonProgressReasons: CountedLabel[];
  strongIndustries: CountedLabel[];
  strongLocations: CountedLabel[];
  recentClientNotes: { appointmentId: string; note: string; submittedAt: string }[];
  preferences: CountedLabel[];
};

// Below this many feedback records the section shows "not enough feedback
// yet" instead of presenting a tiny sample as a trend.
export const MIN_FEEDBACK_FOR_INSIGHTS = 3;

function tally(values: string[], limit: number): CountedLabel[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function computeQualityInsights(
  feedback: AppointmentFeedbackRow[],
  context: Record<string, { industry?: string | null; location?: string | null }>
): QualityInsights {
  const strong = feedback.filter((f) => f.opportunity_quality === "Strong" || f.opportunity_quality === "Good");
  const fitIssues = feedback.flatMap((f) => f.fit_issues ?? []);
  const nonProgress = feedback.filter((f) => NON_PROGRESSING_OUTCOMES.includes(f.outcome));
  const nonProgressReasons = tally(
    nonProgress.flatMap((f) => (f.fit_issues?.length ? f.fit_issues : [f.outcome])),
    5
  );
  const industries = strong.map((f) => context[f.appointment_id]?.industry?.trim()).filter((v): v is string => Boolean(v));
  const locations = strong.map((f) => context[f.appointment_id]?.location?.trim()).filter((v): v is string => Boolean(v));
  const recentClientNotes = [...feedback]
    .filter((f) => f.future_notes?.trim())
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .slice(0, 3)
    .map((f) => ({ appointmentId: f.appointment_id, note: f.future_notes!.trim(), submittedAt: f.submitted_at }));
  const preferenceLabels = fitIssues.map((issue) => FIT_ISSUE_PREFERENCES[issue as FitIssue]).filter((v): v is string => Boolean(v));

  return {
    feedbackCount: feedback.length,
    topFitIssues: tally(fitIssues, 5),
    nonProgressReasons,
    strongIndustries: tally(industries, 3),
    strongLocations: tally(locations, 3),
    recentClientNotes,
    preferences: tally(preferenceLabels, 4),
  };
}

// ---------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------
export function buildBriefEmailSubject(businessName: string, appointmentDate: string): string {
  return `Appointment Brief: ${businessName} (${appointmentDate})`;
}

// Concise plain-text preparation summary. Contains no internal notes and no
// prospect contact details beyond the business name - the full brief is only
// available after signing in to the portal via the CTA.
export function buildBriefEmailBody(input: {
  clientName: string;
  businessName: string;
  appointmentDate: string;
  appointmentTime: string;
  timezone: string;
  primaryOpportunity: string | null;
  whyInterested: string | null;
  recommendedNextStep: string | null;
  portalUrl: string;
}): string {
  const lines = [
    `Hi ${input.clientName} team,`,
    "",
    `Your upcoming appointment with ${input.businessName} has been prepared.`,
    "",
    `Business: ${input.businessName}`,
    `Date: ${input.appointmentDate}`,
    `Time: ${input.appointmentTime} (${input.timezone})`,
  ];
  if (input.primaryOpportunity) lines.push(`Primary opportunity: ${input.primaryOpportunity}`);
  if (input.whyInterested) lines.push(`Why they agreed to meet: ${input.whyInterested}`);
  if (input.recommendedNextStep) lines.push(`Recommended next step: ${input.recommendedNextStep}`);
  lines.push("", "View Appointment Brief (sign in to the Winsalot Client Portal):", input.portalUrl, "", "Best,", "Winsalot Corp. Team");
  return lines.join("\n");
}

export function buildFeedbackRequestEmailSubject(businessName: string): string {
  return `How did your appointment with ${businessName} go?`;
}

export function buildFeedbackRequestEmailBody(input: { clientName: string; businessName: string; appointmentDate: string; portalUrl: string }): string {
  return [
    `Hi ${input.clientName} team,`,
    "",
    `How did your appointment with ${input.businessName} on ${input.appointmentDate} go?`,
    "Your feedback helps us improve the quality and preparation of future appointments. It takes under a minute.",
    "",
    "Share Feedback (sign in to the Winsalot Client Portal):",
    input.portalUrl,
    "",
    "Best,",
    "Winsalot Corp. Team",
  ].join("\n");
}

// Same-origin, id-only deep link - the portal enforces sign-in and RLS, so
// nothing sensitive (and no token) is ever placed in the URL.
export function appointmentPortalPath(appointmentId: string): string {
  return `/client/appointments/${appointmentId}`;
}

// Only same-origin, appointment-brief deep links may be used as a post-login
// destination ("/client/appointments/<uuid>") - never an arbitrary URL.
export function safeClientNextPath(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^\/client\/appointments\/[0-9a-f-]{36}$/i.test(text) ? text : null;
}
