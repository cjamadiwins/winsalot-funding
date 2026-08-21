import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { sendLeadgenEmail } from "./leadgen-email";
import { zonedWallTimeToUtcMs } from "./leadgen-appointment-reminders";
import {
  isValidEmail,
  leadgenAppointmentOccurrenceKey,
  leadgenBusinessAppointmentReminderDisplayStatus,
  type LeadgenAppointmentRow,
  type LeadgenBusinessAppointmentReminderDisplayStatus,
  type LeadgenBusinessAppointmentReminderRow,
  type LeadgenBusinessAppointmentReminderSettingsRow,
  type LeadgenBusinessAppointmentReminderType,
} from "./leadgen-types";

const REMINDER_TABLE = "leadgen_appointment_business_reminders";
const SETTINGS_TABLE = "leadgen_business_appointment_reminder_settings";
const SETTINGS_ID = "00000000-0000-0000-0000-000000000102";
const MAX_ATTEMPTS = 3;
const ELIGIBLE_STATUSES: LeadgenAppointmentRow["status"][] = ["Booked", "Confirmed"];

// This job is invoked by pg_cron (via pg_net, see the header comment in
// supabase/migrations/0068_leadgen_business_appointment_reminders.sql)
// roughly every 15 minutes - far tighter than the once-daily Vercel Cron
// the prospect-facing 24-hour reminder is limited to (Hobby plan). Slack
// is sized so consecutive runs' windows overlap rather than leave gaps
// (15-minute cadence needs >= 7.5 minutes of slack on each side to never
// miss an appointment between two runs); a comfortable margin is used
// instead of the bare minimum to tolerate a late or skipped run without
// missing the target hour entirely.
const WINDOW_SLACK_MINUTES = 20;

const HOURS_BEFORE: Record<LeadgenBusinessAppointmentReminderType, number> = {
  "24_hour_reminder": 24,
  "1_hour_reminder": 1,
};

const TORONTO_TIMEZONE = "America/Toronto";

// The brief requires the appointment time to display in Toronto Eastern
// Time in this email regardless of what timezone is actually stored on
// the appointment row (appt.timezone) - so this always formats the exact
// computed UTC instant (scheduledMs, already timezone-correct via
// zonedWallTimeToUtcMs) against America/Toronto, never appt.appointment_time
// as raw text.
export function formatTorontoAppointmentTime(scheduledMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(scheduledMs));
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

const DEFAULT_SETTINGS: LeadgenBusinessAppointmentReminderSettingsRow = {
  id: SETTINGS_ID,
  automatic_reminders_enabled: true,
  updated_at: new Date(0).toISOString(),
  updated_by_name: null,
};

export async function fetchLeadgenBusinessAppointmentReminderSettings(supabase: SupabaseClient): Promise<LeadgenBusinessAppointmentReminderSettingsRow> {
  const { data } = await supabase.from(SETTINGS_TABLE).select("*").maybeSingle();
  return (data as LeadgenBusinessAppointmentReminderSettingsRow | null) ?? DEFAULT_SETTINGS;
}

export async function updateLeadgenBusinessAppointmentReminderSettings(
  supabase: SupabaseClient,
  automaticRemindersEnabled: boolean,
  updatedByName: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ automatic_reminders_enabled: automaticRemindersEnabled, updated_at: new Date().toISOString(), updated_by_name: updatedByName })
    .eq("id", SETTINGS_ID);
  if (error) return { error: "Failed to update business reminder settings." };
  return {};
}

// ---------------------------------------------------------------------
// Recipient resolution: always the CRM CLIENT's own contact_email (e.g.
// Brent's Essentials -> kelechiamadi@hotmail.com), never the prospect's.
// ---------------------------------------------------------------------

type BusinessReminderRecipient = {
  recipientEmail: string | null;
  recipientName: string | null;
  clientName: string;
};

async function resolveBusinessReminderRecipient(supabase: SupabaseClient, appointment: LeadgenAppointmentRow): Promise<BusinessReminderRecipient> {
  const { data: client } = await supabase
    .from("leadgen_clients")
    .select("name, contact_name, contact_email")
    .eq("id", appointment.client_id)
    .maybeSingle();

  return {
    recipientEmail: client?.contact_email ?? null,
    recipientName: client?.contact_name ?? null,
    clientName: client?.name ?? appointment.business_name,
  };
}

function buildBusinessReminderSubject(reminderType: LeadgenBusinessAppointmentReminderType, prospectBusinessName: string): string {
  const when = reminderType === "24_hour_reminder" ? "Tomorrow" : "in 1 Hour";
  return `Reminder: Appointment with ${prospectBusinessName} ${when}`;
}

function buildBusinessReminderBody(
  appointment: LeadgenAppointmentRow,
  scheduledMs: number,
  reminderType: LeadgenBusinessAppointmentReminderType,
  recipientName: string | null
): string {
  const whenPhrase = reminderType === "24_hour_reminder" ? "in about 24 hours" : "in about 1 hour";
  return [
    `Hi ${recipientName || "there"},`,
    "",
    `This is a reminder that you have a consultation appointment coming up ${whenPhrase}.`,
    "",
    `Prospect Name: ${appointment.contact_name || "—"}`,
    `Business Name: ${appointment.business_name}`,
    `Appointment Date & Time: ${formatTorontoAppointmentTime(scheduledMs)}`,
    `Phone: ${appointment.phone || "—"}`,
    `Email: ${appointment.email || "—"}`,
    `Appointment Notes: ${appointment.appointment_notes || "—"}`,
    "",
    "This is an automatic reminder from your CRM.",
  ].join("\n");
}

// ---------------------------------------------------------------------
// Claim (dedup) logic - one row per (appointment, reminder_type,
// occurrence_key), exactly like the prospect-facing reminder table. This
// is what prevents a duplicate send even if the cron fires more than
// once for the same window (a real possibility here: pg_net calls are
// fire-and-forget, and pg_cron itself can retry a slow invocation).
// ---------------------------------------------------------------------

async function claimReminderSlot(
  admin: SupabaseClient,
  appointmentId: string,
  leadId: string | null,
  reminderType: LeadgenBusinessAppointmentReminderType,
  occurrenceKey: string,
  scheduledAppointmentAtIso: string
): Promise<string | null> {
  const { data: inserted, error: insertError } = await admin
    .from(REMINDER_TABLE)
    .insert({
      appointment_id: appointmentId,
      lead_id: leadId,
      reminder_type: reminderType,
      occurrence_key: occurrenceKey,
      scheduled_appointment_at: scheduledAppointmentAtIso,
      status: "sending",
      attempt_count: 1,
    })
    .select("id")
    .maybeSingle();

  if (inserted) return inserted.id as string;
  if (insertError && insertError.code !== "23505") {
    console.error("[leadgen-business-appointment-reminders] unexpected error claiming reminder slot:", insertError);
    return null;
  }

  const { data: existing } = await admin
    .from(REMINDER_TABLE)
    .select("id, status, attempt_count")
    .eq("appointment_id", appointmentId)
    .eq("reminder_type", reminderType)
    .eq("occurrence_key", occurrenceKey)
    .maybeSingle();

  if (!existing || existing.status !== "failed" || existing.attempt_count >= MAX_ATTEMPTS) return null;

  const { data: retried } = await admin
    .from(REMINDER_TABLE)
    .update({ status: "sending", attempt_count: existing.attempt_count + 1, error_detail: null, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("status", "failed")
    .eq("attempt_count", existing.attempt_count)
    .select("id")
    .maybeSingle();

  return retried ? (retried.id as string) : null;
}

async function markReminderFailed(admin: SupabaseClient, reminderId: string, errorDetail: string): Promise<void> {
  await admin.from(REMINDER_TABLE).update({ status: "failed", error_detail: errorDetail, updated_at: new Date().toISOString() }).eq("id", reminderId);
}

async function markReminderSent(admin: SupabaseClient, reminderId: string, recipientEmail: string, emailId: string): Promise<void> {
  const { data: emailRow } = await admin.from("leadgen_emails").select("resend_message_id").eq("id", emailId).maybeSingle();
  await admin
    .from(REMINDER_TABLE)
    .update({
      status: "sent",
      recipient_email: recipientEmail,
      email_id: emailId,
      resend_message_id: emailRow?.resend_message_id ?? null,
      sent_at: new Date().toISOString(),
      error_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reminderId);
}

// ---------------------------------------------------------------------
// Job entry point
// ---------------------------------------------------------------------

export type BusinessReminderJobResultOutcome = "sent" | "failed" | "skipped_claimed_elsewhere" | "skipped_no_email" | "skipped_invalid_email" | "would_send";

export type BusinessReminderJobResult = {
  appointmentId: string;
  leadId: string | null;
  reminderType: LeadgenBusinessAppointmentReminderType;
  businessName: string;
  scheduledAppointmentAtUtc: string;
  recipientEmail: string | null;
  outcome: BusinessReminderJobResultOutcome;
  error?: string;
};

export type BusinessReminderJobSummary = {
  dryRun: boolean;
  automaticRemindersEnabled: boolean;
  candidatesScanned: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  results: BusinessReminderJobResult[];
};

function isoDateNDaysFrom(base: Date, days: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

export async function runLeadgenBusinessAppointmentReminderJob(options?: { dryRun?: boolean }): Promise<BusinessReminderJobSummary> {
  const dryRun = options?.dryRun ?? false;
  const admin = getSupabaseAdmin();
  const settings = await fetchLeadgenBusinessAppointmentReminderSettings(admin);

  const summary: BusinessReminderJobSummary = {
    dryRun,
    automaticRemindersEnabled: settings.automatic_reminders_enabled,
    candidatesScanned: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  if (!settings.automatic_reminders_enabled && !dryRun) return summary;

  const nowMs = Date.now();
  const slackMs = WINDOW_SLACK_MINUTES * 60 * 1000;

  // Coarse prefilter: appointment_date within [today-1, today+2] safely
  // covers every IANA zone's wall-clock date for any instant up to 24
  // hours out, no matter how far east/west of UTC the appointment's
  // timezone sits. The precise per-appointment/per-reminder-type
  // eligibility check happens below with zonedWallTimeToUtcMs.
  const today = new Date(nowMs);
  const { data: candidates, error: fetchError } = await admin
    .from("leadgen_appointments")
    .select("*")
    .in("status", ELIGIBLE_STATUSES)
    .gte("appointment_date", isoDateNDaysFrom(today, -1))
    .lte("appointment_date", isoDateNDaysFrom(today, 2));

  if (fetchError) {
    console.error("[leadgen-business-appointment-reminders] failed to fetch candidate appointments:", fetchError);
    return summary;
  }

  const rows = (candidates ?? []) as LeadgenAppointmentRow[];
  summary.candidatesScanned = rows.length;

  for (const appt of rows) {
    const scheduledMs = zonedWallTimeToUtcMs(appt.appointment_date, appt.appointment_time, appt.timezone);
    if (scheduledMs <= nowMs) continue; // must still be in the future

    for (const reminderType of Object.keys(HOURS_BEFORE) as LeadgenBusinessAppointmentReminderType[]) {
      const targetMs = scheduledMs - HOURS_BEFORE[reminderType] * 60 * 60 * 1000;
      if (Math.abs(nowMs - targetMs) > slackMs) continue;

      summary.eligible++;
      const scheduledAppointmentAtIso = new Date(scheduledMs).toISOString();
      const occurrenceKey = leadgenAppointmentOccurrenceKey(appt.appointment_date, appt.appointment_time);

      if (dryRun) {
        const recipient = await resolveBusinessReminderRecipient(admin, appt);
        summary.results.push({
          appointmentId: appt.id,
          leadId: appt.lead_id,
          reminderType,
          businessName: appt.business_name,
          scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
          recipientEmail: recipient.recipientEmail,
          outcome: "would_send",
        });
        continue;
      }

      const reminderId = await claimReminderSlot(admin, appt.id, appt.lead_id, reminderType, occurrenceKey, scheduledAppointmentAtIso);
      if (!reminderId) {
        summary.skipped++;
        summary.results.push({
          appointmentId: appt.id,
          leadId: appt.lead_id,
          reminderType,
          businessName: appt.business_name,
          scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
          recipientEmail: null,
          outcome: "skipped_claimed_elsewhere",
        });
        continue;
      }

      const recipient = await resolveBusinessReminderRecipient(admin, appt);
      const resultBase = {
        appointmentId: appt.id,
        leadId: appt.lead_id,
        reminderType,
        businessName: appt.business_name,
        scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
      };

      if (!recipient.recipientEmail) {
        await markReminderFailed(admin, reminderId, "No contact email on file for this client.");
        summary.failed++;
        summary.results.push({ ...resultBase, recipientEmail: null, outcome: "skipped_no_email", error: "No contact email on file for this client." });
        continue;
      }
      if (!isValidEmail(recipient.recipientEmail)) {
        await markReminderFailed(admin, reminderId, "Saved client contact email is invalid.");
        summary.failed++;
        summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "skipped_invalid_email", error: "Saved client contact email is invalid." });
        continue;
      }

      const subject = buildBusinessReminderSubject(reminderType, appt.business_name);
      const body = buildBusinessReminderBody(appt, scheduledMs, reminderType, recipient.recipientName);

      const sendResult = await sendLeadgenEmail(admin, {
        clientId: appt.client_id,
        campaignId: appt.campaign_id,
        leadId: appt.lead_id,
        appointmentId: appt.id,
        templateKey: null,
        toEmail: recipient.recipientEmail,
        toName: recipient.recipientName,
        subject,
        body,
        // System-generated send - no signed-in human triggered this.
        sentBy: null,
        clientVisible: false,
      });

      if (sendResult.error) {
        await markReminderFailed(admin, reminderId, sendResult.error);
        summary.failed++;
        summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "failed", error: sendResult.error });
        continue;
      }

      await markReminderSent(admin, reminderId, recipient.recipientEmail, sendResult.emailId);

      if (appt.lead_id) {
        const label = reminderType === "24_hour_reminder" ? "24-hour" : "1-hour";
        await admin.from("leadgen_lead_activities").insert({
          lead_id: appt.lead_id,
          agent_id: null,
          activity_type: "appointment_business_reminder_auto_sent",
          notes: `Automatic ${label} appointment reminder sent to ${recipient.recipientEmail} (${recipient.clientName}). Appointment: ${appt.appointment_date} ${appt.appointment_time} (${appt.timezone}).`,
        });
      }

      summary.sent++;
      summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "sent" });
    }
  }

  return summary;
}

// ---------------------------------------------------------------------
// Display status for the UI - "Add a reminder status to the appointment
// record showing Scheduled, Sent, Failed, or Cancelled."
// ---------------------------------------------------------------------

export async function fetchLeadgenBusinessAppointmentReminderStatusMap(
  supabase: SupabaseClient,
  appointments: Pick<LeadgenAppointmentRow, "id" | "status" | "appointment_date" | "appointment_time">[]
): Promise<Record<string, LeadgenBusinessAppointmentReminderDisplayStatus>> {
  if (appointments.length === 0) return {};

  const appointmentIds = appointments.map((a) => a.id);
  const { data: reminderRows } = await supabase.from(REMINDER_TABLE).select("*").in("appointment_id", appointmentIds);
  const reminders = (reminderRows ?? []) as LeadgenBusinessAppointmentReminderRow[];

  const remindersByAppointmentId = new Map<string, LeadgenBusinessAppointmentReminderRow[]>();
  for (const r of reminders) {
    const list = remindersByAppointmentId.get(r.appointment_id) ?? [];
    list.push(r);
    remindersByAppointmentId.set(r.appointment_id, list);
  }

  const statusByAppointmentId: Record<string, LeadgenBusinessAppointmentReminderDisplayStatus> = {};
  for (const appt of appointments) {
    const occurrenceKey = leadgenAppointmentOccurrenceKey(appt.appointment_date, appt.appointment_time);
    const currentReminders = (remindersByAppointmentId.get(appt.id) ?? []).filter((r) => r.occurrence_key === occurrenceKey);
    const reminder24h = currentReminders.find((r) => r.reminder_type === "24_hour_reminder") ?? null;
    const reminder1h = currentReminders.find((r) => r.reminder_type === "1_hour_reminder") ?? null;
    const isCurrentlyBookedOrConfirmed = ELIGIBLE_STATUSES.includes(appt.status);

    statusByAppointmentId[appt.id] = leadgenBusinessAppointmentReminderDisplayStatus(isCurrentlyBookedOrConfirmed, reminder24h, reminder1h);
  }

  return statusByAppointmentId;
}
