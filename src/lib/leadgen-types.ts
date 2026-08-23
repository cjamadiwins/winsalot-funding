// Lead Generation CRM: types, enums, and small pure helpers. Deliberately
// self-contained - does not import anything from the cleaning CRM's lib
// files (crm-types.ts, provider-types.ts, etc.) even where a constant
// looks similar (e.g. the Canadian provinces list below), so this CRM's
// type layer can never be accidentally coupled to or broken by changes
// on that side, and vice versa. See supabase/migrations/0031_leadgen_crm.sql
// for the schema this mirrors.

import type { KpiTone } from "@/components/crm-ui/KpiCard";

export const LEADGEN_ROLES = ["admin", "agent", "client"] as const;
export type LeadgenRole = (typeof LEADGEN_ROLES)[number];

export type LeadgenUserRow = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  role: LeadgenRole;
  client_id: string | null;
  active: boolean;
  // "HH:MM:SS" or null - null means no schedule is configured yet for
  // this agent, so late-arrival/early-departure is never flagged for
  // them (see src/lib/attendance-pay.ts). Admin-set from the Attendance
  // page, migration 0075.
  scheduled_start_time: string | null;
};

export type LeadgenAgentAttendanceRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  attendance_date: string;
  clock_in: string;
  clock_out: string | null;
  total_minutes: number | null;
  created_at: string;
  // Set only when an admin force-closes an agent's shift from the
  // Attendance page (see leadgen/admin/(dashboard)/attendance/actions.ts).
  // Null means the agent clocked themselves out.
  clocked_out_by_admin_id: string | null;
  clocked_out_by_admin_name: string | null;
  break1_start: string | null;
  break1_end: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  break2_start: string | null;
  break2_end: string | null;
};

export type LeadgenClientRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  slug: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  booking_link: string | null;
  services_info_link: string | null;
  calendly_event_type_uri: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
};

export const LEADGEN_CAMPAIGN_STATUSES = ["active", "paused", "completed"] as const;
export type LeadgenCampaignStatus = (typeof LEADGEN_CAMPAIGN_STATUSES)[number];

export type LeadgenCampaignRow = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  name: string;
  description: string | null;
  status: LeadgenCampaignStatus;
  booking_link: string | null;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  // Optional free-text phase label (e.g. "3-Appointment Pilot") and
  // target appointment count, shown as "X of Y qualified appointments
  // booked" on the campaign detail page - both null for every campaign
  // that hasn't set them, which is every campaign that existed before
  // migration 0077.
  pilot_label: string | null;
  appointment_goal: number | null;
};

// A single agent-restricted-to-campaign assignment (leadgen_campaign_agents,
// migration 0077). Presence of any row for an agent is what flips them
// into "restricted" mode - see leadgen_agent_campaign_allowed in that
// migration.
export type LeadgenCampaignAgentRow = {
  id: string;
  created_at: string;
  campaign_id: string;
  agent_id: string;
  assigned_by: string | null;
  assigned_at: string;
};

// Call outcome options double as the lead's current status - a call
// outcome *is* the new status. "Consultation Information Sent" is set
// automatically by the Send Consultation Email workflow.
export const LEADGEN_LEAD_STATUSES = [
  "New",
  "Not called",
  "No answer",
  "Voicemail",
  "Gatekeeper",
  "Owner reached",
  "Callback requested",
  "Interested",
  "Information requested",
  "Appointment booked",
  "Not interested",
  "Wrong number",
  "Do not call",
  "Closed",
  "Consultation Information Sent",
] as const;

export type LeadgenLeadStatus = (typeof LEADGEN_LEAD_STATUSES)[number];

export const LEADGEN_LEAD_STATUS_STYLES: Record<LeadgenLeadStatus, string> = {
  New: "bg-blue-100 text-blue-800",
  "Not called": "bg-slate-100 text-slate-700",
  "No answer": "bg-amber-100 text-amber-800",
  Voicemail: "bg-amber-100 text-amber-800",
  Gatekeeper: "bg-amber-100 text-amber-800",
  "Owner reached": "bg-sky-100 text-sky-800",
  "Callback requested": "bg-orange-100 text-orange-800",
  Interested: "bg-indigo-100 text-indigo-800",
  "Information requested": "bg-sky-100 text-sky-800",
  "Appointment booked": "bg-green-100 text-green-800",
  "Not interested": "bg-rose-100 text-rose-800",
  "Wrong number": "bg-rose-100 text-rose-800",
  "Do not call": "bg-rose-200 text-rose-900",
  Closed: "bg-slate-200 text-slate-600",
  "Consultation Information Sent": "bg-indigo-100 text-indigo-800",
};

// Shared dashboard KPI-card tone palette (New Lead=blue, Interested=
// indigo, Appointment Booked=green, Due Today=yellow, Overdue=red) - the
// admin and agent Lead Gen dashboards both import these same tones so
// equivalent cards can never display different colours.
export const LEADGEN_STAT_CARD_STYLES: Record<"leads" | "interested" | "appointments" | "dueToday" | "overdue", KpiTone> = {
  leads: "blue",
  interested: "indigo",
  appointments: "green",
  dueToday: "amber",
  overdue: "red",
};

// Statuses that mean this lead is done being actively worked - used to
// decide whether it should still be eligible for an overdue-follow-up
// flag or a "needs attention" list.
export const LEADGEN_LEAD_CLOSED_STATUSES: LeadgenLeadStatus[] = [
  "Not interested",
  "Wrong number",
  "Do not call",
  "Closed",
];

export type LeadgenLeadRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_name: string;
  industry: string | null;
  contact_name: string | null;
  decision_maker_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  province: string | null;
  lead_source: string | null;
  client_id: string;
  campaign_id: string | null;
  assigned_agent_id: string | null;
  status: LeadgenLeadStatus;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_by: string | null;
};

export const LEADGEN_ACTIVITY_TYPES = [
  "call",
  "email",
  "note",
  "status_change",
  "lead_assigned",
  "lead_reassigned",
  "follow_up_scheduled",
  "follow_up_completed",
  "appointment_booked",
  "appointment_updated",
  "consultation_email_sent",
  "consultation_invitation_sent",
  "consultation_follow_up_sent",
  "appointment_confirmation_resent",
  "appointment_reminder_sent",
  "appointment_reminder_auto_sent",
  "mantra_collab_intro_sent",
] as const;

export type LeadgenActivityType = (typeof LEADGEN_ACTIVITY_TYPES)[number];

export const LEADGEN_ACTIVITY_TYPE_LABELS: Record<LeadgenActivityType, string> = {
  call: "Call",
  email: "Email",
  note: "Note",
  status_change: "Status change",
  lead_assigned: "Lead assigned",
  lead_reassigned: "Lead reassigned",
  follow_up_scheduled: "Follow-up scheduled",
  follow_up_completed: "Follow-up completed",
  appointment_booked: "Appointment booked",
  appointment_updated: "Appointment updated",
  consultation_email_sent: "Consultation email sent",
  consultation_invitation_sent: "15-min consultation invitation sent",
  consultation_follow_up_sent: "Consultation follow-up email sent",
  appointment_confirmation_resent: "Appointment confirmation resent",
  appointment_reminder_sent: "Appointment reminder sent",
  appointment_reminder_auto_sent: "Automatic 24-hour appointment reminder sent",
  mantra_collab_intro_sent: "Mantra Collab intro email sent",
};

export type LeadgenLeadActivityRow = {
  id: string;
  created_at: string;
  lead_id: string;
  agent_id: string | null;
  activity_type: LeadgenActivityType;
  call_outcome: LeadgenLeadStatus | null;
  notes: string | null;
  occurred_at: string;
};

export type LeadgenFollowUpRow = {
  id: string;
  created_at: string;
  lead_id: string;
  agent_id: string | null;
  scheduled_at: string;
  note: string | null;
  status: "pending" | "completed";
  completed_at: string | null;
  completed_by: string | null;
};

export type LeadgenFollowUpWithLead = LeadgenFollowUpRow & {
  leadgen_leads: Pick<
    LeadgenLeadRow,
    "id" | "business_name" | "contact_name" | "phone" | "email" | "status" | "next_follow_up_at"
  > | null;
};

export const LEADGEN_APPOINTMENT_STATUSES = [
  "Booked",
  "Confirmed",
  "Completed",
  "No-show",
  "Rescheduled",
  "Cancelled",
  "Replaced",
] as const;

export type LeadgenAppointmentStatus = (typeof LEADGEN_APPOINTMENT_STATUSES)[number];

export const LEADGEN_APPOINTMENT_STATUS_STYLES: Record<LeadgenAppointmentStatus, string> = {
  Booked: "bg-sky-100 text-sky-800",
  Confirmed: "bg-emerald-100 text-emerald-800",
  Completed: "bg-slate-200 text-slate-700",
  "No-show": "bg-rose-100 text-rose-800",
  Rescheduled: "bg-amber-100 text-amber-800",
  Cancelled: "bg-slate-200 text-slate-500",
  Replaced: "bg-violet-100 text-violet-700",
};

// Statuses that no longer represent a valid, currently-scheduled
// appointment - a genuine cancellation, or the original half of a
// correction (e.g. rebooked after the original email bounced - see the
// "Cancel/Replace Appointment" admin action). Excluded from every
// appointment total across the CRM (dashboard KPI, Results by
// Client/Agent, weekly/monthly performance and incentive calculations)
// so a corrected duplicate never inflates a count - the record itself is
// always kept (never deleted) for lead history/auditing, just left out
// of totals. Centralized here as isLeadgenAppointmentCountable so every
// call site shares the exact same rule instead of re-deriving it.
export const LEADGEN_APPOINTMENT_EXCLUDED_STATUSES: readonly LeadgenAppointmentStatus[] = ["Cancelled", "Replaced"];

export function isLeadgenAppointmentCountable(status: LeadgenAppointmentStatus): boolean {
  return !LEADGEN_APPOINTMENT_EXCLUDED_STATUSES.includes(status);
}

export const LEADGEN_MEETING_TYPES = ["Phone Call", "Video Call", "In Person"] as const;
export type LeadgenMeetingType = (typeof LEADGEN_MEETING_TYPES)[number];

// Weekly Incentive qualification review state (supabase/migrations/
// 0057_leadgen_appointment_incentives.sql) - a separate axis from
// `status` above. `status` tracks the scheduling state (Booked/
// Confirmed/.../Cancelled); incentive_status tracks whether an admin has
// reviewed this appointment as a *qualified* appointment toward the
// booking agent's Weekly Incentive quota. Null means "not yet reviewed" -
// never counts toward anything (see lib/leadgen-incentives.ts).
export const LEADGEN_APPOINTMENT_INCENTIVE_STATUSES = [
  "Qualified",
  "Cancelled",
  "Invalid",
  "Duplicate",
  "Unqualified",
] as const;

export type LeadgenAppointmentIncentiveStatus = (typeof LEADGEN_APPOINTMENT_INCENTIVE_STATUSES)[number];

export const LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES: Record<LeadgenAppointmentIncentiveStatus, string> = {
  Qualified: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-slate-200 text-slate-500",
  Invalid: "bg-rose-100 text-rose-800",
  Duplicate: "bg-amber-100 text-amber-800",
  Unqualified: "bg-rose-100 text-rose-800",
};

// Shown for a null incentive_status (not yet reviewed by an admin).
export const LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL = "Not Reviewed";
export const LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE = "bg-slate-100 text-slate-600";

export type LeadgenAppointmentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  lead_id: string | null;
  client_id: string;
  campaign_id: string | null;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  appointment_date: string;
  appointment_time: string;
  timezone: string;
  meeting_type: LeadgenMeetingType;
  meeting_link: string | null;
  assigned_specialist_id: string | null;
  appointment_notes: string | null;
  confirmation_sent: boolean;
  status: LeadgenAppointmentStatus;
  client_feedback: string | null;
  created_by: string | null;
  admin_notified_at: string | null;
  calendly_invitee_uri: string | null;
  // The agent credited with this booking for the Agent Performance Report
  // (see supabase/migrations/0050_leadgen_agent_performance.sql and
  // lib/leadgen-performance.ts) - set automatically at insert time, never
  // written directly by application code.
  booking_agent_id: string | null;
  // Appointment Incentive review state - see the enum/comment above.
  incentive_status: LeadgenAppointmentIncentiveStatus | null;
  incentive_status_set_by: string | null;
  incentive_status_set_at: string | null;
  // Mandatory reason when incentive_status is anything other than
  // Qualified (migration 0061) - null for Qualified or unreviewed.
  incentive_status_reason: string | null;
  // Optional reason plus who/when for the current `status` value,
  // captured by the "Cancel/Replace Appointment" admin action (migration
  // 0064) - e.g. "Incorrect email—appointment rebooked." Null unless
  // that action has been used on this appointment.
  status_reason: string | null;
  status_set_by: string | null;
  status_set_at: string | null;
};

// Shared literal button text for the consultation booking button, used
// both when rendering the plain-text {{booking_section}} placeholder
// (see leadgenBookingInviteSection below) and when the send actions
// swap that exact marker for a real HTML button - see
// leadgenBookingButtonHtml (style: "booking") in lib/leadgen-email.ts.
// Styled to match the cleaning-quote emails' blue CTA button; the raw
// Calendly URL is deliberately never shown as visible text in the
// email - only this label and the "click here to book your
// consultation" fallback link. Used by the "Send 15-Minute Consultation
// Invitation" and "Send Follow-Up Email" buttons.
export const LEADGEN_BOOKING_BUTTON_LABEL = "Book Your Free 15-Minute Appointment";
// Label for the "Send Consultation Email" button specifically (template
// key consultation_information) - kept distinct from
// LEADGEN_BOOKING_BUTTON_LABEL above (used by the separate consultation
// invitation/follow-up templates) so this one email's button text can
// change without touching those.
export const LEADGEN_CONSULTATION_CTA_LABEL = "Book Your Free 15-Minute Consultation";

// Root-cause fix for the "Thank you for your interest in ." bug: these
// template keys require a specific lead (first name) and are meant to be
// sent only through a lead profile's "Send Follow-Up Email" / "Send
// Consultation Email" buttons, where every {{placeholder}} is filled
// from real data. The Client Communications composer (src/app/leadgen/
// admin/(dashboard)/clients/[id]/ClientDetailClient.tsx) has no lead in
// scope - if offered one of these templates there, its "start from a
// template" step just strips every {{...}} to nothing, producing exactly
// the broken email reported ("Thank you for your interest in .", no
// booking button, no services link, a bare "on behalf of"). Excluded
// from that composer's template dropdown entirely so this can't happen
// again.
//
// "consultation_invitation" is deliberately NOT in this list:
// ClientDetailClient.tsx's applyTemplate() special-cases that one key to
// render it correctly with a generic "there" greeting (no lead name
// available) plus the real client_business_name/booking/services values
// via resolveLeadgenEmailBranding below, instead of stripping it - see
// that component for the render logic and sendClientCommunicationAction
// for the matching server-side HTML-button build.
export const LEADGEN_LEAD_ONLY_TEMPLATE_KEYS = ["consultation_information", "consultation_follow_up"];

// Brent's Essentials is currently the only real Lead Generation CRM
// client, and the brief asked for these exact values as a hard-coded
// safety net: even if leadgen_clients.name/booking_link/
// services_info_link were ever somehow blank at render time, an email
// for this specific client still renders correctly rather than with an
// empty {{client_business_name}}/missing button. Never applied to any
// other client - a blank booking/services link for a different client
// correctly falls back to the generic "please reply"/omitted-section
// behavior (leadgenBookingInviteSection/leadgenServicesInviteSection
// below), not to Brent's Essentials' own links.
export const LEADGEN_BRENTS_ESSENTIALS_FALLBACK = {
  name: "Brent's Essentials",
  bookingUrl: "https://brentsessentials.com/growth-system",
  servicesUrl: "https://brentsessentials.com/growth-system",
} as const;

export const LEADGEN_HIDDEN_CAMPAIGN_NAME = "Q3 Growth Campaign";

export function isHiddenLeadgenCampaignName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === LEADGEN_HIDDEN_CAMPAIGN_NAME.toLowerCase();
}

// The "Send Mantra Collab Email" button/flow (fixed subject/body, own
// booking link) should only ever appear for Mantra Collab's own leads -
// matched by slug, same style as isLeadgenBrentsEssentials below.
export function isMantraCollabClient(client: Pick<LeadgenClientRow, "slug">): boolean {
  return client.slug.trim().toLowerCase() === "mantra-collab";
}

export function isLeadgenBrentsEssentials(client: Pick<LeadgenClientRow, "name" | "slug">): boolean {
  const normalizedSlug = client.slug.trim().toLowerCase();
  const normalizedName = client.name.trim().toLowerCase();
  return (
    normalizedSlug === "brentsessentials" ||
    normalizedSlug === "brents-essentials" ||
    normalizedName === LEADGEN_BRENTS_ESSENTIALS_FALLBACK.name.toLowerCase()
  );
}

// Resolves the effective client name/booking link/services link to
// render into a consultation email, applying the Brent's Essentials
// hard-coded fallback (see above) only when both (a) this client *is*
// Brent's Essentials and (b) the real database value is missing/blank.
// Any other client's blank fields pass through unchanged to the
// existing generic fallback behavior elsewhere.
export function resolveLeadgenEmailBranding(
  client: Pick<LeadgenClientRow, "name" | "slug">,
  bookingLink: string | null,
  servicesLink: string | null
): { clientName: string; bookingUrl: string | null; servicesUrl: string | null } {
  const isBrents = isLeadgenBrentsEssentials(client);
  const clientName = client.name.trim() || (isBrents ? LEADGEN_BRENTS_ESSENTIALS_FALLBACK.name : client.name);
  // The booking button must only ever use the client's actual saved
  // Consultation Booking Link - never the Brent's Essentials website
  // (or any other hardcoded/stale link) as a fallback. A blank link
  // means null here; every caller that sends a consultation-related
  // email is responsible for blocking the send with a clear error
  // instead of silently substituting a different URL (see the
  // "Please add a Consultation Booking Link..." checks in the leadgen
  // lead-detail send actions).
  const bookingUrl = bookingLink?.trim() || null;
  const servicesUrl = servicesLink?.trim() || (isBrents ? LEADGEN_BRENTS_ESSENTIALS_FALLBACK.servicesUrl : servicesLink);
  return { clientName, bookingUrl, servicesUrl: servicesUrl || null };
}

export type LeadgenEmailTemplateRow = {
  id: string;
  created_at: string;
  updated_at: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
  active: boolean;
  created_by: string | null;
};

export const LEADGEN_EMAIL_STATUSES = ["draft", "sending", "sent", "delivered", "delayed", "bounced", "complained", "opened", "clicked", "failed"] as const;
export type LeadgenEmailStatus = (typeof LEADGEN_EMAIL_STATUSES)[number];

export const LEADGEN_EMAIL_STATUS_STYLES: Record<LeadgenEmailStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sending: "bg-amber-100 text-amber-800",
  sent: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  delayed: "bg-amber-100 text-amber-800",
  bounced: "bg-rose-100 text-rose-800",
  complained: "bg-rose-200 text-rose-900",
  opened: "bg-cyan-100 text-cyan-800",
  clicked: "bg-indigo-100 text-indigo-800",
  failed: "bg-rose-200 text-rose-900",
};

// Display label shown in the UI - distinct from the raw DB value for
// 'complained', which reads as "Marked as spam" to a non-technical admin
// or agent rather than the Resend event-name jargon.
export const LEADGEN_EMAIL_STATUS_LABELS: Record<LeadgenEmailStatus, string> = {
  draft: "Draft",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  delayed: "Delayed",
  bounced: "Bounced",
  complained: "Marked as spam",
  opened: "Opened",
  clicked: "Consultation Link Clicked",
  failed: "Failed",
};

export type LeadgenEmailRow = {
  id: string;
  created_at: string;
  client_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  appointment_id: string | null;
  template_key: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body: string;
  sender_email: string;
  sent_by: string | null;
  status: LeadgenEmailStatus;
  resend_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  delayed_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
  complained_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  client_visible: boolean;
};

// The single most recent status-change timestamp across every possible
// status column - used to show "Last updated" in the Communications UI
// without a dedicated status_at column (leadgen_emails deliberately keeps
// one timestamp column per event type, mirroring the cleaning CRM's
// crm_lead_emails).
export function leadgenEmailStatusAt(email: LeadgenEmailRow): string {
  return (
    email.failed_at ??
    email.clicked_at ??
    email.opened_at ??
    email.complained_at ??
    email.bounced_at ??
    email.delayed_at ??
    email.delivered_at ??
    email.sent_at ??
    email.created_at
  );
}

export type LeadgenBouncedEmailRow = {
  email: string;
  bounce_reason: string | null;
  bounced_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
};

// Automatic 24-hour appointment reminders (supabase/migrations/0067_
// leadgen_appointment_reminders.sql) - see lib/leadgen-appointment-reminders.ts
// for the eligibility/claim/send logic that reads and writes this table.
export const LEADGEN_APPOINTMENT_REMINDER_TYPES = ["24_hour_reminder"] as const;
export type LeadgenAppointmentReminderType = (typeof LEADGEN_APPOINTMENT_REMINDER_TYPES)[number];

export const LEADGEN_APPOINTMENT_REMINDER_STATUSES = ["sending", "sent", "failed"] as const;
export type LeadgenAppointmentReminderStatus = (typeof LEADGEN_APPOINTMENT_REMINDER_STATUSES)[number];

export type LeadgenAppointmentReminderRow = {
  id: string;
  created_at: string;
  updated_at: string;
  appointment_id: string;
  lead_id: string | null;
  reminder_type: LeadgenAppointmentReminderType;
  occurrence_key: string;
  scheduled_appointment_at: string;
  status: LeadgenAppointmentReminderStatus;
  recipient_email: string | null;
  email_id: string | null;
  resend_message_id: string | null;
  error_detail: string | null;
  attempt_count: number;
  sent_at: string | null;
  source: "automatic" | "manual";
  created_by: string | null;
};

export type LeadgenAppointmentReminderSettingsRow = {
  id: string;
  automatic_reminders_enabled: boolean;
  reminder_hours_before: number;
  sender_name: string;
  reply_to_email: string;
  updated_at: string;
  updated_by_name: string | null;
};

// occurrence_key is the appointment's own date+time at the moment a
// reminder is claimed - a reschedule naturally produces a new key, which
// is what lets a rescheduled appointment become eligible for a brand new
// reminder while every prior occurrence's history stays intact (brief:
// "use an appointment occurrence/version identifier").
export function leadgenAppointmentOccurrenceKey(appointmentDate: string, appointmentTime: string): string {
  return `${appointmentDate}T${appointmentTime}`;
}

// Displayed status for the "Automatic Reminder" badge shown to both
// admins and the assigned agent (brief: "Show: Scheduled / Sent /
// Delivered / Bounced / Failed"). Sent/Delivered/Bounced/Failed come from
// the linked leadgen_emails row (the existing tracked-email pipeline,
// updated by the Resend webhook) once one exists; "Scheduled" is derived
// - there is deliberately no row in leadgen_appointment_reminders until
// the reminder is actually claimed, so an eligible, not-yet-claimed
// appointment shows "Scheduled" purely because no row (and no linked
// email) exists yet.
export type LeadgenAppointmentReminderDisplayStatus =
  | "Scheduled"
  | "Sending"
  | "Sent"
  | "Delivered"
  | "Bounced"
  | "Failed"
  | "Not scheduled";

export function leadgenAppointmentReminderDisplayStatus(
  reminder: LeadgenAppointmentReminderRow | null,
  linkedEmail: LeadgenEmailRow | null,
  isEligibleForFutureReminder: boolean
): LeadgenAppointmentReminderDisplayStatus {
  if (!reminder) return isEligibleForFutureReminder ? "Scheduled" : "Not scheduled";
  if (linkedEmail) {
    if (linkedEmail.status === "delivered") return "Delivered";
    if (linkedEmail.status === "bounced" || linkedEmail.status === "complained") return "Bounced";
    if (linkedEmail.status === "failed") return "Failed";
    if (linkedEmail.status === "sent" || linkedEmail.status === "opened" || linkedEmail.status === "clicked" || linkedEmail.status === "delayed") return "Sent";
  }
  if (reminder.status === "failed") return "Failed";
  if (reminder.status === "sent") return "Sent";
  return "Sending";
}

// Automatic BUSINESS-facing appointment reminders (supabase/migrations/
// 0068_leadgen_business_appointment_reminders.sql) - reminds the CRM
// client (e.g. Brent's Essentials, via leadgen_clients.contact_email)
// that one of THEIR booked/confirmed appointments is coming up, 24 hours
// and again 1 hour before it. Deliberately a separate table/type/job from
// the prospect-facing reminder above - see the migration's header comment
// for why. See lib/leadgen-business-appointment-reminders.ts for the
// eligibility/claim/send logic.
export const LEADGEN_BUSINESS_APPOINTMENT_REMINDER_TYPES = ["24_hour_reminder", "1_hour_reminder"] as const;
export type LeadgenBusinessAppointmentReminderType = (typeof LEADGEN_BUSINESS_APPOINTMENT_REMINDER_TYPES)[number];

export const LEADGEN_BUSINESS_APPOINTMENT_REMINDER_STATUSES = ["sending", "sent", "failed"] as const;
export type LeadgenBusinessAppointmentReminderStatus = (typeof LEADGEN_BUSINESS_APPOINTMENT_REMINDER_STATUSES)[number];

export type LeadgenBusinessAppointmentReminderRow = {
  id: string;
  created_at: string;
  updated_at: string;
  appointment_id: string;
  lead_id: string | null;
  reminder_type: LeadgenBusinessAppointmentReminderType;
  occurrence_key: string;
  scheduled_appointment_at: string;
  status: LeadgenBusinessAppointmentReminderStatus;
  recipient_email: string | null;
  email_id: string | null;
  resend_message_id: string | null;
  error_detail: string | null;
  attempt_count: number;
  sent_at: string | null;
};

export type LeadgenBusinessAppointmentReminderSettingsRow = {
  id: string;
  automatic_reminders_enabled: boolean;
  updated_at: string;
  updated_by_name: string | null;
};

// The brief's requested four-value status shown "on the appointment
// record": Scheduled / Sent / Failed / Cancelled. Unlike the richer
// Sent/Delivered/Bounced/Failed badge above (which tracks a single
// prospect-facing send through the Resend webhook pipeline), this
// combines BOTH the 24-hour and 1-hour reminder slots for one appointment
// into a single label:
// - "Cancelled": the appointment itself is no longer Booked/Confirmed
//   (cancelled, rescheduled-away, completed, no-show, replaced) - neither
//   reminder will ever send for this occurrence.
// - "Sent": the later (1-hour) reminder has already gone out, so nothing
//   further is pending for this appointment.
// - "Failed": either slot's claimed send failed and the other hasn't
//   already succeeded to supersede it.
// - "Scheduled": still eligible and waiting on one or both future sends
//   (the common case for a newly booked appointment).
export type LeadgenBusinessAppointmentReminderDisplayStatus = "Scheduled" | "Sent" | "Failed" | "Cancelled";

export const LEADGEN_BUSINESS_APPOINTMENT_REMINDER_STATUS_STYLES: Record<LeadgenBusinessAppointmentReminderDisplayStatus, string> = {
  Scheduled: "bg-sky-100 text-sky-800",
  Sent: "bg-emerald-100 text-emerald-800",
  Failed: "bg-rose-100 text-rose-800",
  Cancelled: "bg-slate-200 text-slate-500",
};

export function leadgenBusinessAppointmentReminderDisplayStatus(
  isAppointmentCurrentlyBookedOrConfirmed: boolean,
  reminder24h: LeadgenBusinessAppointmentReminderRow | null,
  reminder1h: LeadgenBusinessAppointmentReminderRow | null
): LeadgenBusinessAppointmentReminderDisplayStatus {
  // A completed send is never retroactively relabeled "Cancelled" just
  // because the appointment later moved to e.g. Completed/No-show - the
  // reminder genuinely went out.
  if (reminder1h?.status === "sent") return "Sent";
  if (!isAppointmentCurrentlyBookedOrConfirmed) return "Cancelled";
  if (reminder1h?.status === "failed") return "Failed";
  if (reminder24h?.status === "failed") return "Failed";
  return "Scheduled";
}

// Small, self-contained province list (deliberately not shared with the
// cleaning CRM's lib/provider-types.ts - see file header).
export const LEADGEN_PROVINCES = [
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
] as const;

// The Lead Generation CRM's operating timezone for Due Today/Overdue
// day-boundary comparisons. This matters because the app runs on Vercel
// serverless functions, whose Node process is UTC regardless of where
// staff actually are - comparing calendar dates via Date's local-time
// getters (getFullYear/getMonth/getDate) would silently use UTC's day
// boundary instead of Toronto's, misclassifying anything scheduled in
// the evening Toronto time (already "tomorrow" in UTC) as due the wrong
// day. Overdue itself doesn't need this - "is this instant in the past"
// is timezone-agnostic - only the "is this the same calendar day" check
// does.
const LEADGEN_TIMEZONE = "America/Toronto";

// "YYYY-MM-DD" for `date` as it falls in LEADGEN_TIMEZONE, so two dates
// can be compared for "same calendar day" correctly regardless of what
// timezone the server process itself is running in.
function leadgenDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LEADGEN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isLeadgenFollowUpOverdue(followUp: Pick<LeadgenFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  return new Date(followUp.scheduled_at).getTime() < Date.now();
}

export function isLeadgenFollowUpDueToday(followUp: Pick<LeadgenFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  if (isLeadgenFollowUpOverdue(followUp)) return false;
  return leadgenDateKey(new Date(followUp.scheduled_at)) === leadgenDateKey(new Date());
}

export function isLeadgenFollowUpUpcoming(followUp: Pick<LeadgenFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  if (isLeadgenFollowUpOverdue(followUp)) return false;
  return leadgenDateKey(new Date(followUp.scheduled_at)) > leadgenDateKey(new Date());
}

// Same due-today/overdue rules as above, but operating directly on a
// lead's next_follow_up_at (LeadgenLeadRow) instead of a followup row -
// used by the admin Leads page's "Due Today"/"Overdue" filters (linked
// from the dashboard's Follow-Ups cards). next_follow_up_at is always
// kept in sync with that lead's earliest *pending* follow-up (see
// recomputeNextFollowUp in the leadgen lead-detail actions), so no
// separate status check is needed here - null simply means no pending
// follow-up exists.
export function isLeadgenNextFollowUpOverdue(nextFollowUpAt: string | null): boolean {
  if (!nextFollowUpAt) return false;
  return new Date(nextFollowUpAt).getTime() < Date.now();
}

export function isLeadgenNextFollowUpDueToday(nextFollowUpAt: string | null): boolean {
  if (!nextFollowUpAt) return false;
  if (isLeadgenNextFollowUpOverdue(nextFollowUpAt)) return false;
  return leadgenDateKey(new Date(nextFollowUpAt)) === leadgenDateKey(new Date());
}

export function leadgenOverdueDurationLabel(scheduledIso: string): string {
  const elapsedMs = Date.now() - new Date(scheduledIso).getTime();
  if (elapsedMs <= 0) return "";
  const minutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} overdue`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} overdue`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} overdue`;
  return "Just now overdue";
}

// Formats an ISO timestamp for a <input type="datetime-local"> defaultValue.
export function toLeadgenDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Suggests a URL-safe slug from a client's display name (e.g. "Brent's
// Essentials" -> "brents-essentials"). The admin can still edit it before
// saving - this is only a starting point, and the database enforces
// uniqueness regardless.
export function slugifyClientName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Minimal {{placeholder}} substitution - intentionally simple (no
// conditionals/loops), matching the brief's plain-text templates. Kept
// in this client-safe module (rather than the server-only
// lib/leadgen-email.ts) since the consultation email modal needs it to
// render a live preview in the browser before sending.
export function renderLeadgenTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

// Campaign-level booking link overrides the client's default; falls back
// to the client's when the campaign has none set (or there's no
// campaign at all).
export function getEffectiveBookingLink(
  client: Pick<LeadgenClientRow, "booking_link">,
  campaign: Pick<LeadgenCampaignRow, "booking_link"> | null
): string | null {
  return campaign?.booking_link || client.booking_link || null;
}

// Brief: "If no booking link exists: Do not show a broken link. Replace
// that paragraph with: 'Please reply to this email with a suitable day
// and time.'"
export function leadgenBookingParagraph(bookingLink: string | null): string {
  if (!bookingLink) return "Please reply to this email with a suitable day and time.";
  return `You can reply to this email, or use the booking link below to choose a convenient time:\n\n${bookingLink}`;
}

// Same never-show-a-broken-link rule as leadgenBookingParagraph() above,
// for the "15-Minute Consultation Invitation" / follow-up templates'
// {{booking_section}} placeholder, which keeps the call-to-action link
// line separate from the raw link underneath it. buttonLabel defaults to
// the follow-up template's wording; the invitation template passes its
// own (LEADGEN_BOOKING_BUTTON_LABEL, "Book a free 15-minute consultation
// appointment") explicitly.
export function leadgenBookingInviteSection(bookingLink: string | null, buttonLabel = "BOOK YOUR 15-MINUTE CONSULTATION"): string {
  if (!bookingLink) return "Please reply to this email with a suitable day and time.";
  return `[${buttonLabel}]\n\n${bookingLink}`;
}

// The second "learn more about our services" button. Unlike the booking
// button, there's no safe fallback text for a missing link - it simply
// isn't shown at all (the {{services_section}} placeholder renders as
// an empty string), since "no services link configured" isn't something
// a prospect needs prompted about the way "no booking link" is.
export function leadgenServicesButtonLabel(clientName: string): string {
  return `LEARN MORE ABOUT ${clientName.toUpperCase()} SERVICES`;
}

export function leadgenServicesInviteSection(servicesLink: string | null, clientName: string): string {
  if (!servicesLink) return "";
  return `Want to learn more first?\n\n[${leadgenServicesButtonLabel(clientName)}]\n\n${servicesLink}`;
}

// Basic but real email validation - deliberately not a full RFC5322
// implementation (nothing in this app needs one), just enough to catch
// "missing @", "missing domain", and obviously malformed input before
// spending a Resend API call on it.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Leave Requests (leadgen_leave_requests, migration 0070) - identical
// shape to the Cleaning CRM's crm_leave_requests (migration 0069). Pure
// notice-period/deduction math lives in src/lib/leave-requests.ts, shared
// with the Cleaning CRM since that logic has nothing CRM-specific about
// it (same reasoning as src/lib/payroll.ts being shared); only the row
// shape is duplicated here, matching this file's own stated convention.
import type { LeaveAttendanceStatus, LeaveStatus, LeaveType } from "./leave-requests";

export type LeadgenLeaveRequestRow = {
  id: string;
  agent_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  notice_days: number;
  is_short_notice: boolean;
  submitted_at: string;
  decision_note: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  attendance_status: LeaveAttendanceStatus;
  attendance_marked_at: string | null;
  attendance_marked_by: string | null;
  attendance_marked_by_name: string | null;
  deduction_amount: number | null;
  deduction_reason: string | null;
  deduction_confirmed: boolean;
  deduction_confirmed_by: string | null;
  deduction_confirmed_by_name: string | null;
  deduction_confirmed_at: string | null;
  payroll_applied_id: string | null;
  payroll_applied_at: string | null;
  // Soft-delete only (migration 0076) - a real DELETE would cascade-
  // delete this row's own audit trail, including the very "deleted"
  // entry recording who deleted it and when. The app filters every list
  // query to exclude deleted_at is not null rows instead.
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadgenLeaveRequestWithAgent = LeadgenLeaveRequestRow & {
  leadgen_users: Pick<LeadgenUserRow, "id" | "full_name" | "email"> | null;
};

export type LeadgenLeaveRequestAuditLogRow = {
  id: string;
  created_at: string;
  leave_request_id: string;
  agent_id: string | null;
  agent_name: string;
  action:
    | "submitted"
    | "approved"
    | "declined"
    | "attendance_marked_paid_leave"
    | "attendance_marked_unpaid_absence"
    | "deduction_confirmed"
    | "payroll_applied"
    | "edited"
    | "deleted";
  performed_by: string | null;
  performed_by_name: string;
  note: string | null;
  details: Record<string, unknown> | null;
};
