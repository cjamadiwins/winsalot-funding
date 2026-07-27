// Lead Generation CRM: types, enums, and small pure helpers. Deliberately
// self-contained - does not import anything from the cleaning CRM's lib
// files (crm-types.ts, provider-types.ts, etc.) even where a constant
// looks similar (e.g. the Canadian provinces list below), so this CRM's
// type layer can never be accidentally coupled to or broken by changes
// on that side, and vice versa. See supabase/migrations/0031_leadgen_crm.sql
// for the schema this mirrors.

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
  New: "bg-slate-100 text-slate-700",
  "Not called": "bg-slate-100 text-slate-700",
  "No answer": "bg-amber-100 text-amber-800",
  Voicemail: "bg-amber-100 text-amber-800",
  Gatekeeper: "bg-amber-100 text-amber-800",
  "Owner reached": "bg-sky-100 text-sky-800",
  "Callback requested": "bg-orange-100 text-orange-800",
  Interested: "bg-emerald-100 text-emerald-800",
  "Information requested": "bg-sky-100 text-sky-800",
  "Appointment booked": "bg-purple-100 text-purple-800",
  "Not interested": "bg-rose-100 text-rose-800",
  "Wrong number": "bg-rose-100 text-rose-800",
  "Do not call": "bg-rose-200 text-rose-900",
  Closed: "bg-slate-200 text-slate-600",
  "Consultation Information Sent": "bg-indigo-100 text-indigo-800",
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
  leadgen_leads: Pick<LeadgenLeadRow, "id" | "business_name" | "contact_name" | "phone" | "email" | "status"> | null;
};

export const LEADGEN_APPOINTMENT_STATUSES = [
  "Booked",
  "Confirmed",
  "Completed",
  "No-show",
  "Rescheduled",
  "Cancelled",
] as const;

export type LeadgenAppointmentStatus = (typeof LEADGEN_APPOINTMENT_STATUSES)[number];

export const LEADGEN_APPOINTMENT_STATUS_STYLES: Record<LeadgenAppointmentStatus, string> = {
  Booked: "bg-sky-100 text-sky-800",
  Confirmed: "bg-emerald-100 text-emerald-800",
  Completed: "bg-slate-200 text-slate-700",
  "No-show": "bg-rose-100 text-rose-800",
  Rescheduled: "bg-amber-100 text-amber-800",
  Cancelled: "bg-slate-200 text-slate-500",
};

export const LEADGEN_MEETING_TYPES = ["Phone Call", "Video Call", "In Person"] as const;
export type LeadgenMeetingType = (typeof LEADGEN_MEETING_TYPES)[number];

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
};

// Shared literal button text for the consultation booking button, used
// both when rendering the plain-text {{booking_section}} placeholder
// (see leadgenBookingInviteSection below) and when the send actions
// swap that exact marker for a real HTML <a> button - see
// LEADGEN_BOOKING_BUTTON_LABEL usage in lib/leadgen-email.ts.
export const LEADGEN_BOOKING_BUTTON_LABEL = "BOOK YOUR FREE 15-MINUTE CONSULTATION";

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
  bookingUrl: "https://calendly.com/kelechiamadi1/free-15-minute-business-growth-strategy-session?month=2026-07",
  servicesUrl: "https://www.brentsessentials.com/growth-system",
} as const;

export function isLeadgenBrentsEssentials(client: Pick<LeadgenClientRow, "name" | "slug">): boolean {
  return client.slug === "BrentsEssentials" || client.name.trim() === LEADGEN_BRENTS_ESSENTIALS_FALLBACK.name;
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
  const bookingUrl = bookingLink?.trim() || (isBrents ? LEADGEN_BRENTS_ESSENTIALS_FALLBACK.bookingUrl : bookingLink);
  const servicesUrl = servicesLink?.trim() || (isBrents ? LEADGEN_BRENTS_ESSENTIALS_FALLBACK.servicesUrl : servicesLink);
  return { clientName, bookingUrl: bookingUrl || null, servicesUrl: servicesUrl || null };
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

export const LEADGEN_EMAIL_STATUSES = ["draft", "sending", "sent", "delivered", "delayed", "bounced", "complained", "failed"] as const;
export type LeadgenEmailStatus = (typeof LEADGEN_EMAIL_STATUSES)[number];

export const LEADGEN_EMAIL_STATUS_STYLES: Record<LeadgenEmailStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sending: "bg-amber-100 text-amber-800",
  sent: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  delayed: "bg-amber-100 text-amber-800",
  bounced: "bg-rose-100 text-rose-800",
  complained: "bg-rose-200 text-rose-900",
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

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isLeadgenFollowUpOverdue(followUp: Pick<LeadgenFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  return new Date(followUp.scheduled_at).getTime() < Date.now();
}

export function isLeadgenFollowUpDueToday(followUp: Pick<LeadgenFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  if (isLeadgenFollowUpOverdue(followUp)) return false;
  return startOfDay(new Date(followUp.scheduled_at)) === startOfDay(new Date());
}

export function isLeadgenFollowUpUpcoming(followUp: Pick<LeadgenFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  if (isLeadgenFollowUpOverdue(followUp)) return false;
  return startOfDay(new Date(followUp.scheduled_at)) > startOfDay(new Date());
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
// {{booking_section}} placeholder, which keeps the call-to-action button
// line separate from the raw link underneath it. buttonLabel defaults to
// the follow-up template's wording; the invitation template passes its
// own ("BOOK YOUR FREE 15-MINUTE CONSULTATION") explicitly.
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
