// Winsalot Growth CRM: consultation-booking system types. Deliberately
// fully independent of the Lead Gen CRM's leadgen-types.ts equivalents -
// same architecture reused, no shared code, per the brief's requirement
// that the two systems stay completely separate.

import type { OpportunityType } from "./crm-types";

export const WINSALOT_APPOINTMENT_STATUSES = ["booked", "cancelled"] as const;
export type WinsalotAppointmentStatus = (typeof WINSALOT_APPOINTMENT_STATUSES)[number];

export const WINSALOT_APPOINTMENT_BOOKED_BY = ["agent", "self"] as const;
export type WinsalotAppointmentBookedBy = (typeof WINSALOT_APPOINTMENT_BOOKED_BY)[number];

export const WINSALOT_APPOINTMENT_CANCELLED_BY_ROLES = ["admin", "agent", "prospect"] as const;
export type WinsalotAppointmentCancelledByRole = (typeof WINSALOT_APPOINTMENT_CANCELLED_BY_ROLES)[number];

// Weekly Incentive qualification review state (migration 0090) - a
// separate axis from `status` above, mirroring the Lead Gen CRM's
// LeadgenAppointmentIncentiveStatus (leadgen-types.ts) exactly. `status`
// tracks the scheduling state (booked/cancelled); incentive_status
// tracks whether an admin has reviewed this appointment as a *qualified*
// consultation toward the assigned agent's Weekly Incentive quota. Null
// means "not yet reviewed" - never counts toward anything (see
// lib/crm-incentives.ts).
export const WINSALOT_APPOINTMENT_INCENTIVE_STATUSES = ["Qualified", "Cancelled", "Invalid", "Duplicate", "Unqualified"] as const;
export type WinsalotAppointmentIncentiveStatus = (typeof WINSALOT_APPOINTMENT_INCENTIVE_STATUSES)[number];

export const WINSALOT_APPOINTMENT_INCENTIVE_STATUS_STYLES: Record<WinsalotAppointmentIncentiveStatus, string> = {
  Qualified: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-slate-200 text-slate-500",
  Invalid: "bg-rose-100 text-rose-800",
  Duplicate: "bg-amber-100 text-amber-800",
  Unqualified: "bg-rose-100 text-rose-800",
};

// Shown for a null incentive_status (not yet reviewed by an admin).
export const WINSALOT_APPOINTMENT_INCENTIVE_PENDING_LABEL = "Not Reviewed";
export const WINSALOT_APPOINTMENT_INCENTIVE_PENDING_STYLE = "bg-slate-100 text-slate-600";

// "Do not count the same appointment twice" / "cancelled appointments
// never qualify" - the exact isLeadgenAppointmentCountable rule, applied
// to this CRM's own simpler two-state `status` column.
export function isWinsalotAppointmentCountable(status: WinsalotAppointmentStatus): boolean {
  return status !== "cancelled";
}

export type WinsalotAppointmentRow = {
  id: string;
  created_at: string;
  updated_at: string;

  opportunity_id: string | null;

  contact_name: string;
  business_name: string;
  email: string;
  phone: string;
  // Automatically true whenever `phone` above is a valid mobile number
  // at booking/edit time (isValidMobileNumber) - no separate consent
  // checkbox; the SMS_CONSENT_NOTICE shown beneath every booking form
  // discloses this instead. Defaults to false (migration 0125) so no
  // pre-existing appointment (booked before this behavior existed)
  // starts receiving SMS reminders until it's next booked or edited.
  sms_consent: boolean;
  service_type: OpportunityType;
  notes: string | null;

  appointment_start_at: string; // ISO, UTC
  appointment_end_at: string; // ISO, UTC

  prospect_timezone: string | null;
  business_timezone: string;

  status: WinsalotAppointmentStatus;

  booked_by: WinsalotAppointmentBookedBy;
  booked_by_user_id: string | null;
  assigned_agent_id: string | null;

  cancelled_at: string | null;
  cancelled_by_role: WinsalotAppointmentCancelledByRole | null;
  cancelled_by_user_id: string | null;
  cancelled_reason: string | null;

  admin_notified_at: string | null;

  incentive_status: WinsalotAppointmentIncentiveStatus | null;
  incentive_status_set_by: string | null;
  incentive_status_set_at: string | null;
  incentive_status_reason: string | null;
};

export type WinsalotAppointmentWithOpportunity = WinsalotAppointmentRow & {
  crm_opportunities: { id: string; business_name: string; stage: string } | null;
};

export type WinsalotAvailabilitySettingsRow = {
  id: string;
  available_weekdays: number[]; // 0 (Sun) - 6 (Sat)
  business_start_time: string; // "HH:MM:SS"
  business_end_time: string; // "HH:MM:SS"
  business_timezone: string;
  min_notice_minutes: number;
  max_advance_days: number;
  buffer_minutes: number;
  updated_at: string;
  updated_by_name: string | null;
};

export type WinsalotBlackoutRow = {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type WinsalotTokenPurpose = "prefill" | "reschedule" | "cancel";

export type WinsalotAppointmentTokenRow = {
  token: string;
  purpose: WinsalotTokenPurpose;
  opportunity_id: string | null;
  appointment_id: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export const WINSALOT_REMINDER_TYPES = ["24_hour_reminder", "1_hour_reminder"] as const;
export type WinsalotReminderType = (typeof WINSALOT_REMINDER_TYPES)[number];

export type WinsalotAppointmentReminderRow = {
  id: string;
  created_at: string;
  updated_at: string;
  appointment_id: string;
  reminder_type: WinsalotReminderType;
  occurrence_key: string;
  scheduled_appointment_at: string;
  status: "sending" | "sent" | "failed";
  recipient_email: string | null;
  resend_email_id: string | null;
  crm_lead_email_id: string | null;
  error_detail: string | null;
  attempt_count: number;
  sent_at: string | null;
};

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------
// SMS appointment reminders (supabase/migrations/0125_appointment_sms_
// reminders.sql) - see the Lead Gen CRM's equivalent block in
// leadgen-types.ts for the full rationale (recipient_type split, shared
// claim/send logic in src/lib/appointment-sms.ts). Fully independent
// table (winsalot_appointment_sms_reminders) from that CRM's own.
// ---------------------------------------------------------------------
export type WinsalotSmsRecipientType = "prospect" | "admin";
export type WinsalotSmsReminderStatus = "sending" | "sent" | "delivered" | "failed" | "skipped" | "opted_out";

export type WinsalotAppointmentSmsReminderRow = {
  id: string;
  created_at: string;
  updated_at: string;
  appointment_id: string;
  reminder_type: WinsalotReminderType;
  recipient_type: WinsalotSmsRecipientType;
  occurrence_key: string;
  scheduled_appointment_at: string;
  status: WinsalotSmsReminderStatus;
  recipient_phone: string | null;
  twilio_message_sid: string | null;
  twilio_status: string | null;
  error_detail: string | null;
  attempt_count: number;
  sent_at: string | null;
  delivered_at: string | null;
};

export type WinsalotSmsReminderDisplayStatus = "Scheduled" | "Sending" | "Sent" | "Delivered" | "Failed" | "Skipped" | "Opted Out" | "Not scheduled";

export function winsalotSmsReminderDisplayStatus(
  reminder: WinsalotAppointmentSmsReminderRow | null,
  isEligibleForFutureReminder: boolean
): WinsalotSmsReminderDisplayStatus {
  if (!reminder) return isEligibleForFutureReminder ? "Scheduled" : "Not scheduled";
  switch (reminder.status) {
    case "delivered":
      return "Delivered";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "opted_out":
      return "Opted Out";
    default:
      return "Sending";
  }
}

export type WinsalotSmsReminderStatusEntry = {
  status24h: WinsalotSmsReminderDisplayStatus;
  errorDetail24h: string | null;
  status1h: WinsalotSmsReminderDisplayStatus;
  errorDetail1h: string | null;
};

// Dedicated "automatic SMS reminders" toggle (migration 0126) -
// runWinsalotAppointmentReminderJob's email path has never had a
// settings row of its own (always unconditionally on whenever its cron
// route is invoked); this new singleton exists solely to gate the SMS
// side without introducing any new behavior for email.
export type WinsalotAppointmentReminderSettingsRow = {
  id: string;
  automatic_sms_reminders_enabled: boolean;
  // Global, admin-editable "Company SMS Notification Number" (migration
  // 0141) - Winsalot Corp's own phone number for the immediate booking
  // SMS and the 24-hour/1-hour reminder SMS, Growth CRM only. Null/blank
  // means it isn't configured yet, in which case those company sends are
  // skipped (recorded "Skipped", never a hard failure) exactly like a
  // missing process.env.ADMIN_PHONE_NUMBER always has been.
  company_sms_notification_number: string | null;
  updated_at: string;
  updated_by_name: string | null;
};

// A reschedule/cancellation produces a fresh occurrence_key, which is
// what lets a rescheduled appointment become eligible for brand new
// 24h/1h reminders while the prior occurrence's send history stays
// intact - see winsalot-consultation-reminders.ts.
export function winsalotAppointmentOccurrenceKey(appointmentStartAtIso: string): string {
  return appointmentStartAtIso;
}

const SERVICE_TYPE_LABELS: Record<OpportunityType, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Financing",
  both_services: "Both",
};

export function winsalotServiceTypeLabel(type: OpportunityType): string {
  return SERVICE_TYPE_LABELS[type];
}
