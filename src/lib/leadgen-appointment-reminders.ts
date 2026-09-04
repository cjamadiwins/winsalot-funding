import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { sendLeadgenEmail } from "./leadgen-email";
import { buildAppointmentEmailBody, buildAppointmentEmailSubject, resolveAppointmentEmailRecipient } from "./leadgen-appointment-emails";
import { sendAppointmentReminderSmsPair, type SmsOutcome } from "./appointment-sms";
import {
  isValidEmail,
  leadgenAppointmentOccurrenceKey,
  leadgenAppointmentReminderDisplayStatus,
  leadgenAppointmentReminderErrorDetail,
  leadgenSmsReminderDisplayStatus,
  type LeadgenAppointmentReminderRow,
  type LeadgenAppointmentReminderSettingsRow,
  type LeadgenAppointmentReminderStatusEntry,
  type LeadgenAppointmentReminderType,
  type LeadgenAppointmentRow,
  type LeadgenAppointmentSmsReminderRow,
  type LeadgenEmailRow,
  type LeadgenSmsRecipientType,
  type LeadgenSmsReminderStatusEntry,
  type LeadgenSmsReminderType,
} from "./leadgen-types";

const REMINDER_TABLE = "leadgen_appointment_reminders";
const SETTINGS_TABLE = "leadgen_appointment_reminder_settings";
const SETTINGS_ID = "00000000-0000-0000-0000-000000000101";
const MAX_ATTEMPTS = 3;
// Half the eligibility window's slack either side of the target hour
// (brief: "identify appointments between 23 hours 45 minutes and 24
// hours 15 minutes away... a safe time window so appointments are not
// missed if a cron execution is delayed"). The brief's own example (15
// minutes) assumes a 15-minute cron cadence - this Vercel account is on
// the Hobby plan, which only permits a *daily* cron (see vercel.json:
// "0 13 * * *"), so the window is widened to 12 hours instead: with a
// once-a-day cron, consecutive days' windows must tile the timeline with
// no gaps (today's ends where tomorrow's begins) or an appointment could
// be skipped entirely. The trade-off is precision (a reminder can land
// anywhere from ~12 to ~36 hours before the appointment) rather than the
// tight ~24-hour target a sub-daily cadence would give. If this project
// upgrades to Pro, tighten both this constant (back to 15) and the
// vercel.json schedule (back to "*/15 * * * *") together - the claim
// logic's duplicate prevention is unaffected either way.
const WINDOW_SLACK_MINUTES = 12 * 60;

// The new 1-hour prospect reminder (runLeadgenProspect1HourReminderJob,
// below) is invoked every 15 minutes via Supabase pg_cron/pg_net (see
// migration 0124) rather than Vercel's once-daily cron, so it uses the
// same tight slack as the business/Growth CRM reminders instead of the
// 24-hour reminder's 12-hour compensation for a daily cadence.
const WINDOW_SLACK_MINUTES_1H = 20;

// ---------------------------------------------------------------------
// Time-zone-safe UTC conversion
// ---------------------------------------------------------------------

// Converts a wall-clock date+time as it would read in `timeZone` (any
// IANA zone, e.g. America/Toronto, America/Vancouver, America/Edmonton,
// America/Winnipeg) into the correct UTC instant - the "guess and
// correct" technique also used by date-fns-tz/luxon: format an initial
// guess in the target zone, measure how far off the shown wall-clock is
// from the actual target, and correct. Two passes always converge,
// including across a DST transition (e.g. Toronto's EST/EDT switch), so
// this never hardcodes a fixed UTC offset.
export function zonedWallTimeToUtcMs(dateStr: string, timeStr: string, timeZone: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  let guessMs = targetMs;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guessMs)).map((p) => [p.type, p.value]));
    const shownMs = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const diff = shownMs - targetMs;
    if (diff === 0) break;
    guessMs -= diff;
  }
  return guessMs;
}

function isoDateNDaysFrom(base: Date, days: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Settings (brief "ADMIN SETTINGS")
// ---------------------------------------------------------------------

const DEFAULT_SETTINGS: LeadgenAppointmentReminderSettingsRow = {
  id: SETTINGS_ID,
  automatic_reminders_enabled: false,
  reminder_hours_before: 24,
  sender_name: "Winsalot Corp.",
  reply_to_email: "info@winsalotcorp.com",
  updated_at: new Date(0).toISOString(),
  updated_by_name: null,
};

export async function fetchLeadgenAppointmentReminderSettings(supabase: SupabaseClient): Promise<LeadgenAppointmentReminderSettingsRow> {
  const { data } = await supabase.from(SETTINGS_TABLE).select("*").maybeSingle();
  return (data as LeadgenAppointmentReminderSettingsRow | null) ?? DEFAULT_SETTINGS;
}

export async function updateLeadgenAppointmentReminderSettings(
  supabase: SupabaseClient,
  updates: Partial<Pick<LeadgenAppointmentReminderSettingsRow, "automatic_reminders_enabled" | "reminder_hours_before" | "sender_name" | "reply_to_email">>,
  updatedByName: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString(), updated_by_name: updatedByName })
    .eq("id", SETTINGS_ID);
  if (error) return { error: "Failed to update reminder settings." };
  return {};
}

// ---------------------------------------------------------------------
// Manual "Count this as the 24-hour reminder" (brief MANUAL CONTROLS)
// ---------------------------------------------------------------------

// Records a manually-sent reminder as having fulfilled this occurrence's
// automatic-reminder slot, so the cron job's claim below sees an
// existing row and skips it. Never overwrites an existing row (a plain
// insert that lets a 23505 conflict fail silently) - if the automatic
// reminder (or an earlier "count as" claim) already exists for this
// occurrence, that row is left exactly as-is; the manual send itself
// already happened and was already logged independently.
export async function claimManualAppointmentReminderSlot(
  supabase: SupabaseClient,
  params: {
    appointmentId: string;
    leadId: string | null;
    appointmentDate: string;
    appointmentTime: string;
    timezone: string;
    recipientEmail: string;
    emailId: string | null;
    createdBy: string;
  }
): Promise<void> {
  const occurrenceKey = leadgenAppointmentOccurrenceKey(params.appointmentDate, params.appointmentTime);
  const scheduledAppointmentAtIso = new Date(zonedWallTimeToUtcMs(params.appointmentDate, params.appointmentTime, params.timezone)).toISOString();
  await supabase.from(REMINDER_TABLE).insert({
    appointment_id: params.appointmentId,
    lead_id: params.leadId,
    reminder_type: "24_hour_reminder",
    occurrence_key: occurrenceKey,
    scheduled_appointment_at: scheduledAppointmentAtIso,
    status: "sent",
    recipient_email: params.recipientEmail,
    email_id: params.emailId,
    sent_at: new Date().toISOString(),
    source: "manual",
    created_by: params.createdBy,
  });
}

// ---------------------------------------------------------------------
// Automatic reminder cron job (brief "AUTOMATIC REMINDER" / "SCHEDULING")
// ---------------------------------------------------------------------

// Shared by both the 24-hour and 1-hour prospect reminder jobs -
// identical claim/retry logic, only the reminder_type differs, so a
// single implementation keeps them from drifting apart. The unique
// constraint on (appointment_id, reminder_type, occurrence_key) is what
// actually guarantees only one caller ever wins a claim, even if a cron
// invokes more than once or two requests race; reminder_type keeps the
// two interval's claims fully independent of each other.
async function claimAutomaticReminderSlot(
  admin: SupabaseClient,
  appointmentId: string,
  leadId: string | null,
  reminderType: LeadgenAppointmentReminderType,
  occurrenceKey: string,
  scheduledAppointmentAtIso: string
): Promise<string | null> {
  // First attempt: a brand-new claim for this occurrence.
  const { data: inserted, error: insertError } = await admin
    .from(REMINDER_TABLE)
    .insert({
      appointment_id: appointmentId,
      lead_id: leadId,
      reminder_type: reminderType,
      occurrence_key: occurrenceKey,
      scheduled_appointment_at: scheduledAppointmentAtIso,
      status: "sending",
      source: "automatic",
      attempt_count: 1,
    })
    .select("id")
    .maybeSingle();

  if (inserted) return inserted.id as string;
  if (insertError && insertError.code !== "23505") {
    console.error("[leadgen-appointment-reminders] unexpected error claiming reminder slot:", insertError);
    return null;
  }

  // A row already exists for this exact occurrence - retry it only if
  // the prior attempt failed and hasn't exceeded the retry cap. The
  // final UPDATE's WHERE clause (id + status='failed' + the exact
  // attempt_count just read) is the atomic part: if two concurrent runs
  // both reach here, only one's UPDATE actually matches a row - the
  // other affects zero rows and safely returns null.
  const { data: existing } = await admin.from(REMINDER_TABLE).select("id, status, attempt_count").eq("appointment_id", appointmentId).eq("reminder_type", reminderType).eq("occurrence_key", occurrenceKey).maybeSingle();

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

export type ReminderJobResultOutcome = "sent" | "failed" | "skipped_claimed_elsewhere" | "skipped_no_email" | "skipped_invalid_email" | "would_send";

export type ReminderJobResult = {
  appointmentId: string;
  leadId: string | null;
  businessName: string;
  scheduledAppointmentAtUtc: string;
  timezone: string;
  recipientEmail: string | null;
  outcome: ReminderJobResultOutcome;
  error?: string;
};

// SMS results (src/lib/appointment-sms.ts) - one entry per recipient
// type (prospect/admin) per eligible appointment, entirely independent
// of the email outcome above: a failed/skipped email never blocks an
// SMS send for the same occurrence, and vice versa.
export type SmsReminderJobResult = {
  appointmentId: string;
  leadId: string | null;
  reminderType: LeadgenSmsReminderType;
  recipientType: LeadgenSmsRecipientType;
  businessName: string;
  scheduledAppointmentAtUtc: string;
  recipientPhone: string | null;
  outcome: SmsOutcome;
  error?: string;
};

export type ReminderJobSummary = {
  dryRun: boolean;
  automaticRemindersEnabled: boolean;
  windowStartUtc: string;
  windowEndUtc: string;
  candidatesScanned: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  results: ReminderJobResult[];
  smsSent: number;
  smsFailed: number;
  smsSkipped: number;
  smsResults: SmsReminderJobResult[];
};

// Shared by both the 24-hour and 1-hour jobs below - claims/sends the
// prospect + admin SMS pair for one appointment occurrence and folds
// both outcomes into the summary, exactly like the email block above it
// folds its own single outcome in. Never affects the email path's
// control flow (no `continue`/`return` here that could skip it) - SMS
// is sent (or recorded as skipped/failed) regardless of what happened to
// the email for this same appointment/reminder_type.
async function recordLeadgenAppointmentSms(
  admin: SupabaseClient,
  summary: ReminderJobSummary,
  appt: LeadgenAppointmentRow,
  reminderType: LeadgenSmsReminderType,
  occurrenceKey: string,
  scheduledMs: number,
  scheduledAppointmentAtIso: string,
  businessName: string,
  dryRun: boolean
): Promise<void> {
  const { prospect, admin: adminOutcome } = await sendAppointmentReminderSmsPair(admin, {
    table: "leadgen_appointment_sms_reminders",
    appointmentId: appt.id,
    leadId: appt.lead_id,
    reminderType,
    occurrenceKey,
    scheduledMs,
    scheduledAppointmentAtIso,
    timezone: appt.timezone,
    prospectPhone: appt.phone,
    prospectConsent: appt.sms_consent,
    businessName,
    contactName: appt.contact_name,
    crmLabel: "Lead Gen",
    dryRun,
  });

  for (const [recipientType, result] of [
    ["prospect", prospect],
    ["admin", adminOutcome],
  ] as const) {
    if (result.outcome === "sent") summary.smsSent++;
    else if (result.outcome === "failed") summary.smsFailed++;
    else if (result.outcome !== "would_send") summary.smsSkipped++;

    summary.smsResults.push({
      appointmentId: appt.id,
      leadId: appt.lead_id,
      reminderType,
      recipientType,
      businessName,
      scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
      recipientPhone: result.recipientPhone ?? null,
      outcome: result.outcome,
      error: result.error,
    });
  }
}

// Entry point for the Vercel Cron endpoint (brief "SCHEDULING") - also
// callable with { dryRun: true } to compute exactly which appointments
// would be reminded and to which address, without sending anything or
// writing a claim row, for safe verification against real data.
export async function runLeadgenAppointmentReminderJob(options?: { dryRun?: boolean }): Promise<ReminderJobSummary> {
  const dryRun = options?.dryRun ?? false;
  const admin = getSupabaseAdmin();
  const settings = await fetchLeadgenAppointmentReminderSettings(admin);

  const nowMs = Date.now();
  const hoursBefore = settings.reminder_hours_before;
  const slackMs = WINDOW_SLACK_MINUTES * 60 * 1000;
  const targetMs = nowMs + hoursBefore * 60 * 60 * 1000;
  const windowStartMs = targetMs - slackMs;
  const windowEndMs = targetMs + slackMs;

  const summary: ReminderJobSummary = {
    dryRun,
    automaticRemindersEnabled: settings.automatic_reminders_enabled,
    windowStartUtc: new Date(windowStartMs).toISOString(),
    windowEndUtc: new Date(windowEndMs).toISOString(),
    candidatesScanned: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
    smsSent: 0,
    smsFailed: 0,
    smsSkipped: 0,
    smsResults: [],
  };

  // The toggle only gates the automatic cron path - a dry run always
  // computes what *would* happen so an admin/tester can verify targeting
  // before flipping it on. SMS shares this exact same gate (and the
  // exact same eligibility window computed below) - there is no separate
  // "automatic SMS reminders enabled" setting.
  if (!settings.automatic_reminders_enabled && !dryRun) return summary;

  // Coarse prefilter in the database: appointment_date within
  // [today-1, today+3] safely covers every IANA zone's wall-clock date
  // for any instant in the eligibility window, no matter how far east or
  // west of UTC the appointment's own timezone sits. The precise
  // per-appointment UTC instant (and the real eligibility check) is
  // computed below with zonedWallTimeToUtcMs.
  const today = new Date(nowMs);
  const { data: candidates, error: fetchError } = await admin
    .from("leadgen_appointments")
    .select("*")
    .in("status", ["Booked", "Confirmed"])
    .gte("appointment_date", isoDateNDaysFrom(today, -1))
    .lte("appointment_date", isoDateNDaysFrom(today, 3));

  if (fetchError) {
    console.error("[leadgen-appointment-reminders] failed to fetch candidate appointments:", fetchError);
    return summary;
  }

  const rows = (candidates ?? []) as LeadgenAppointmentRow[];
  summary.candidatesScanned = rows.length;

  // A deactivated client (leadgen_clients.active = false - see the Clients
  // page's Activate/Deactivate control) must stop receiving new automated
  // reminders even for its existing, still-booked appointments. Existing
  // appointment/reminder rows are never touched - this only skips claiming
  // a *new* reminder slot for them.
  const clientIds = Array.from(new Set(rows.map((appt) => appt.client_id)));
  const { data: activeClientRows } = clientIds.length
    ? await admin.from("leadgen_clients").select("id").in("id", clientIds).eq("active", true)
    : { data: [] as { id: string }[] };
  const activeClientIds = new Set((activeClientRows ?? []).map((c) => c.id));

  for (const appt of rows) {
    if (!activeClientIds.has(appt.client_id)) continue;
    const scheduledMs = zonedWallTimeToUtcMs(appt.appointment_date, appt.appointment_time, appt.timezone);
    if (scheduledMs < windowStartMs || scheduledMs > windowEndMs) continue;
    if (scheduledMs <= nowMs) continue; // must still be in the future

    summary.eligible++;
    const scheduledAppointmentAtIso = new Date(scheduledMs).toISOString();
    const occurrenceKey = leadgenAppointmentOccurrenceKey(appt.appointment_date, appt.appointment_time);
    const recipient = await resolveAppointmentEmailRecipient(admin, appt);

    // ---- Email (unchanged behavior/outcomes from before this change -
    // only restructured from early `continue`s into if/else so the SMS
    // block below always still runs for this appointment). ----
    if (dryRun) {
      summary.results.push({
        appointmentId: appt.id,
        leadId: appt.lead_id,
        businessName: appt.business_name,
        scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
        timezone: appt.timezone,
        recipientEmail: recipient.recipientEmail,
        outcome: "would_send",
      });
    } else {
      const reminderId = await claimAutomaticReminderSlot(admin, appt.id, appt.lead_id, "24_hour_reminder", occurrenceKey, scheduledAppointmentAtIso);
      if (!reminderId) {
        summary.skipped++;
        summary.results.push({
          appointmentId: appt.id,
          leadId: appt.lead_id,
          businessName: appt.business_name,
          scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
          timezone: appt.timezone,
          recipientEmail: null,
          outcome: "skipped_claimed_elsewhere",
        });
      } else {
        const resultBase = {
          appointmentId: appt.id,
          leadId: appt.lead_id,
          businessName: recipient.businessName,
          scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
          timezone: appt.timezone,
        };

        if (!recipient.recipientEmail) {
          await markReminderFailed(admin, reminderId, "No email address on file.");
          summary.failed++;
          summary.results.push({ ...resultBase, recipientEmail: null, outcome: "skipped_no_email", error: "No email address on file." });
        } else if (!isValidEmail(recipient.recipientEmail)) {
          await markReminderFailed(admin, reminderId, "Saved email address is invalid.");
          summary.failed++;
          summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "skipped_invalid_email", error: "Saved email address is invalid." });
        } else {
          const subject = buildAppointmentEmailSubject("auto_reminder", recipient.clientName);
          const body = buildAppointmentEmailBody(appt, recipient.recipientName, recipient.businessName, recipient.clientName, "auto_reminder");

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
            // System-generated send, same convention as the original booking
            // notification (notifyOfNewLeadgenAppointment) - no signed-in
            // human triggered this.
            sentBy: null,
            clientVisible: false,
            senderDisplayNameOverride: settings.sender_name,
            replyToOverride: settings.reply_to_email,
          });

          if (sendResult.error) {
            await markReminderFailed(admin, reminderId, sendResult.error);
            summary.failed++;
            summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "failed", error: sendResult.error });
          } else {
            await markReminderSent(admin, reminderId, recipient.recipientEmail, sendResult.emailId);

            if (appt.lead_id) {
              await admin.from("leadgen_lead_activities").insert({
                lead_id: appt.lead_id,
                agent_id: null,
                activity_type: "appointment_reminder_auto_sent",
                notes: `Automatic 24-hour appointment reminder sent to ${recipient.recipientEmail}. Appointment: ${appt.appointment_date} ${appt.appointment_time} (${appt.timezone}).`,
              });
            }

            summary.sent++;
            summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "sent" });
          }
        }
      }
    }

    // ---- SMS (new - independent of every email outcome above) ----
    await recordLeadgenAppointmentSms(admin, summary, appt, "24_hour_reminder", occurrenceKey, scheduledMs, scheduledAppointmentAtIso, recipient.businessName, dryRun);
  }

  return summary;
}

// ---------------------------------------------------------------------
// Automatic 1-HOUR prospect reminder (new: the prospect attending the
// appointment previously only ever got a single reminder at
// reminder_hours_before, default 24h - this adds a second, always-fixed
// 1-hour-before reminder alongside it, matching the pattern the business
// reminder (leadgen-business-appointment-reminders.ts) and Growth CRM's
// own prospect reminder (winsalot-consultation-reminders.ts) already use.
// Same table (leadgen_appointment_reminders), same claim/dedup/occurrence-
// key machinery, same recipient resolution and settings gate as the
// 24-hour job above - only the target hour, slack window, and email copy
// differ, so this deliberately mirrors runLeadgenAppointmentReminderJob's
// structure line for line rather than trying to unify the two into one
// generic loop, keeping the working 24-hour job's code untouched and this
// addition easy to verify in isolation.
//
// Invoked by Supabase pg_cron/pg_net every 15 minutes (migration 0124),
// not the daily Vercel Cron the 24-hour job uses - a once-daily
// invocation cannot meaningfully deliver a reminder "1 hour before".
// ---------------------------------------------------------------------

const HOURS_BEFORE_1H = 1;

export async function runLeadgenProspect1HourReminderJob(options?: { dryRun?: boolean }): Promise<ReminderJobSummary> {
  const dryRun = options?.dryRun ?? false;
  const admin = getSupabaseAdmin();
  const settings = await fetchLeadgenAppointmentReminderSettings(admin);

  const nowMs = Date.now();
  const slackMs = WINDOW_SLACK_MINUTES_1H * 60 * 1000;
  const targetMs = nowMs + HOURS_BEFORE_1H * 60 * 60 * 1000;
  const windowStartMs = targetMs - slackMs;
  const windowEndMs = targetMs + slackMs;

  const summary: ReminderJobSummary = {
    dryRun,
    automaticRemindersEnabled: settings.automatic_reminders_enabled,
    windowStartUtc: new Date(windowStartMs).toISOString(),
    windowEndUtc: new Date(windowEndMs).toISOString(),
    candidatesScanned: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
    smsSent: 0,
    smsFailed: 0,
    smsSkipped: 0,
    smsResults: [],
  };

  if (!settings.automatic_reminders_enabled && !dryRun) return summary;

  const today = new Date(nowMs);
  const { data: candidates, error: fetchError } = await admin
    .from("leadgen_appointments")
    .select("*")
    .in("status", ["Booked", "Confirmed"])
    .gte("appointment_date", isoDateNDaysFrom(today, -1))
    .lte("appointment_date", isoDateNDaysFrom(today, 3));

  if (fetchError) {
    console.error("[leadgen-prospect-1hour-reminder] failed to fetch candidate appointments:", fetchError);
    return summary;
  }

  const rows = (candidates ?? []) as LeadgenAppointmentRow[];
  summary.candidatesScanned = rows.length;

  const clientIds = Array.from(new Set(rows.map((appt) => appt.client_id)));
  const { data: activeClientRows } = clientIds.length
    ? await admin.from("leadgen_clients").select("id").in("id", clientIds).eq("active", true)
    : { data: [] as { id: string }[] };
  const activeClientIds = new Set((activeClientRows ?? []).map((c) => c.id));

  for (const appt of rows) {
    if (!activeClientIds.has(appt.client_id)) continue;
    const scheduledMs = zonedWallTimeToUtcMs(appt.appointment_date, appt.appointment_time, appt.timezone);
    if (scheduledMs < windowStartMs || scheduledMs > windowEndMs) continue;
    if (scheduledMs <= nowMs) continue;

    summary.eligible++;
    const scheduledAppointmentAtIso = new Date(scheduledMs).toISOString();
    const occurrenceKey = leadgenAppointmentOccurrenceKey(appt.appointment_date, appt.appointment_time);
    const recipient = await resolveAppointmentEmailRecipient(admin, appt);

    // ---- Email (unchanged behavior/outcomes - restructured from early
    // `continue`s into if/else so the SMS block below always still runs). ----
    if (dryRun) {
      summary.results.push({
        appointmentId: appt.id,
        leadId: appt.lead_id,
        businessName: appt.business_name,
        scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
        timezone: appt.timezone,
        recipientEmail: recipient.recipientEmail,
        outcome: "would_send",
      });
    } else {
      const reminderId = await claimAutomaticReminderSlot(admin, appt.id, appt.lead_id, "1_hour_reminder", occurrenceKey, scheduledAppointmentAtIso);
      if (!reminderId) {
        summary.skipped++;
        summary.results.push({
          appointmentId: appt.id,
          leadId: appt.lead_id,
          businessName: appt.business_name,
          scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
          timezone: appt.timezone,
          recipientEmail: null,
          outcome: "skipped_claimed_elsewhere",
        });
      } else {
        const resultBase = {
          appointmentId: appt.id,
          leadId: appt.lead_id,
          businessName: recipient.businessName,
          scheduledAppointmentAtUtc: scheduledAppointmentAtIso,
          timezone: appt.timezone,
        };

        if (!recipient.recipientEmail) {
          await markReminderFailed(admin, reminderId, "No email address on file.");
          summary.failed++;
          summary.results.push({ ...resultBase, recipientEmail: null, outcome: "skipped_no_email", error: "No email address on file." });
        } else if (!isValidEmail(recipient.recipientEmail)) {
          await markReminderFailed(admin, reminderId, "Saved email address is invalid.");
          summary.failed++;
          summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "skipped_invalid_email", error: "Saved email address is invalid." });
        } else {
          const subject = buildAppointmentEmailSubject("auto_reminder_1h", recipient.clientName);
          const body = buildAppointmentEmailBody(appt, recipient.recipientName, recipient.businessName, recipient.clientName, "auto_reminder_1h");

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
            sentBy: null,
            clientVisible: false,
            senderDisplayNameOverride: settings.sender_name,
            replyToOverride: settings.reply_to_email,
          });

          if (sendResult.error) {
            await markReminderFailed(admin, reminderId, sendResult.error);
            summary.failed++;
            summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "failed", error: sendResult.error });
          } else {
            await markReminderSent(admin, reminderId, recipient.recipientEmail, sendResult.emailId);

            if (appt.lead_id) {
              await admin.from("leadgen_lead_activities").insert({
                lead_id: appt.lead_id,
                agent_id: null,
                activity_type: "appointment_reminder_auto_sent",
                notes: `Automatic 1-hour appointment reminder sent to ${recipient.recipientEmail}. Appointment: ${appt.appointment_date} ${appt.appointment_time} (${appt.timezone}).`,
              });
            }

            summary.sent++;
            summary.results.push({ ...resultBase, recipientEmail: recipient.recipientEmail, outcome: "sent" });
          }
        }
      }
    }

    // ---- SMS (new - independent of every email outcome above) ----
    await recordLeadgenAppointmentSms(admin, summary, appt, "1_hour_reminder", occurrenceKey, scheduledMs, scheduledAppointmentAtIso, recipient.businessName, dryRun);
  }

  return summary;
}

// ---------------------------------------------------------------------
// Display status for the UI (brief EMAIL TRACKING: "Show: Scheduled /
// Sent / Delivered / Bounced / Failed... visible to both administrators
// and the assigned agent")
// ---------------------------------------------------------------------

// One query per table (not one per appointment) for whichever
// appointments a page is already rendering - the admin/agent Appointments
// pages and the Lead Detail page's Appointments section all call this
// with their own already-fetched appointment rows. Only the reminder row
// matching each appointment's *current* occurrence_key counts - a stale
// row from before a reschedule is intentionally ignored here, exactly
// like it's ignored by the claim logic above.
export async function fetchLeadgenAppointmentReminderStatusMap(
  supabase: SupabaseClient,
  appointments: Pick<LeadgenAppointmentRow, "id" | "status" | "appointment_date" | "appointment_time" | "timezone">[]
): Promise<Record<string, LeadgenAppointmentReminderStatusEntry>> {
  if (appointments.length === 0) return {};

  const settings = await fetchLeadgenAppointmentReminderSettings(supabase);
  const nowMs = Date.now();
  const appointmentIds = appointments.map((a) => a.id);

  const { data: reminderRows } = await supabase.from(REMINDER_TABLE).select("*").in("appointment_id", appointmentIds);
  const reminders = (reminderRows ?? []) as LeadgenAppointmentReminderRow[];

  // Two rows can exist per appointment now (one per reminder_type), so
  // group by appointment id and pick out each type below rather than
  // collapsing to one row per appointment.
  const remindersByAppointmentId = new Map<string, LeadgenAppointmentReminderRow[]>();
  for (const r of reminders) {
    const list = remindersByAppointmentId.get(r.appointment_id) ?? [];
    list.push(r);
    remindersByAppointmentId.set(r.appointment_id, list);
  }

  const emailIds = reminders.map((r) => r.email_id).filter((id): id is string => !!id);
  const { data: emailRows } = emailIds.length ? await supabase.from("leadgen_emails").select("*").in("id", emailIds) : { data: [] as LeadgenEmailRow[] };
  const emailById = new Map(((emailRows ?? []) as LeadgenEmailRow[]).map((e) => [e.id, e]));

  const statusByAppointmentId: Record<string, LeadgenAppointmentReminderStatusEntry> = {};
  for (const appt of appointments) {
    const occurrenceKey = leadgenAppointmentOccurrenceKey(appt.appointment_date, appt.appointment_time);
    const currentReminders = (remindersByAppointmentId.get(appt.id) ?? []).filter((r) => r.occurrence_key === occurrenceKey);
    const reminder24h = currentReminders.find((r) => r.reminder_type === "24_hour_reminder") ?? null;
    const reminder1h = currentReminders.find((r) => r.reminder_type === "1_hour_reminder") ?? null;
    const linkedEmail24h = reminder24h?.email_id ? (emailById.get(reminder24h.email_id) ?? null) : null;
    const linkedEmail1h = reminder1h?.email_id ? (emailById.get(reminder1h.email_id) ?? null) : null;

    const isEligible =
      settings.automatic_reminders_enabled &&
      (appt.status === "Booked" || appt.status === "Confirmed") &&
      zonedWallTimeToUtcMs(appt.appointment_date, appt.appointment_time, appt.timezone) > nowMs;

    statusByAppointmentId[appt.id] = {
      status24h: leadgenAppointmentReminderDisplayStatus(reminder24h, linkedEmail24h, isEligible),
      errorDetail24h: leadgenAppointmentReminderErrorDetail(reminder24h, linkedEmail24h),
      status1h: leadgenAppointmentReminderDisplayStatus(reminder1h, linkedEmail1h, isEligible),
      errorDetail1h: leadgenAppointmentReminderErrorDetail(reminder1h, linkedEmail1h),
    };
  }

  return statusByAppointmentId;
}

// SMS counterpart to fetchLeadgenAppointmentReminderStatusMap above -
// same "one query per table, current-occurrence-only" shape, reading
// leadgen_appointment_sms_reminders' prospect-recipient rows only (the
// admin notification's own rows are a separate concern, not shown on a
// per-appointment badge to admins/agents).
export async function fetchLeadgenAppointmentSmsReminderStatusMap(
  supabase: SupabaseClient,
  appointments: Pick<LeadgenAppointmentRow, "id" | "status" | "appointment_date" | "appointment_time" | "timezone" | "sms_consent" | "phone">[]
): Promise<Record<string, LeadgenSmsReminderStatusEntry>> {
  if (appointments.length === 0) return {};

  const settings = await fetchLeadgenAppointmentReminderSettings(supabase);
  const nowMs = Date.now();
  const appointmentIds = appointments.map((a) => a.id);

  const { data: reminderRows } = await supabase
    .from("leadgen_appointment_sms_reminders")
    .select("*")
    .eq("recipient_type", "prospect")
    .in("appointment_id", appointmentIds);
  const reminders = (reminderRows ?? []) as LeadgenAppointmentSmsReminderRow[];

  const remindersByAppointmentId = new Map<string, LeadgenAppointmentSmsReminderRow[]>();
  for (const r of reminders) {
    const list = remindersByAppointmentId.get(r.appointment_id) ?? [];
    list.push(r);
    remindersByAppointmentId.set(r.appointment_id, list);
  }

  const statusByAppointmentId: Record<string, LeadgenSmsReminderStatusEntry> = {};
  for (const appt of appointments) {
    const occurrenceKey = leadgenAppointmentOccurrenceKey(appt.appointment_date, appt.appointment_time);
    const currentReminders = (remindersByAppointmentId.get(appt.id) ?? []).filter((r) => r.occurrence_key === occurrenceKey);
    const reminder24h = currentReminders.find((r) => r.reminder_type === "24_hour_reminder") ?? null;
    const reminder1h = currentReminders.find((r) => r.reminder_type === "1_hour_reminder") ?? null;

    const isEligible =
      settings.automatic_reminders_enabled &&
      appt.sms_consent &&
      !!appt.phone &&
      (appt.status === "Booked" || appt.status === "Confirmed") &&
      zonedWallTimeToUtcMs(appt.appointment_date, appt.appointment_time, appt.timezone) > nowMs;

    statusByAppointmentId[appt.id] = {
      status24h: leadgenSmsReminderDisplayStatus(reminder24h, isEligible),
      errorDetail24h: reminder24h?.status === "failed" || reminder24h?.status === "skipped" || reminder24h?.status === "opted_out" ? reminder24h.error_detail : null,
      status1h: leadgenSmsReminderDisplayStatus(reminder1h, isEligible),
      errorDetail1h: reminder1h?.status === "failed" || reminder1h?.status === "skipped" || reminder1h?.status === "opted_out" ? reminder1h.error_detail : null,
    };
  }

  return statusByAppointmentId;
}
