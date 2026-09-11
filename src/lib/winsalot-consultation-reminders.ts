import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getEmailReplyTo, getEmailSender } from "./email-senders";
import { getSiteUrl } from "./site-url";
import { createWinsalotActionToken } from "./winsalot-consultation-tokens";
import { buildWinsalotConfirmationEmail, buildWinsalotReminderEmail } from "./winsalot-consultation-emails";
import {
  buildAdminReminderSms,
  buildAppointmentConfirmationSms,
  buildProspectReminderSms,
  claimAndSendAppointmentSms,
  formatSmsDateLabel,
  formatSmsTimeLabel,
  isAppointmentToday,
  isValidMobileNumber,
  type ManualSmsResult,
  type SmsOutcome,
} from "./appointment-sms";
import {
  winsalotAppointmentOccurrenceKey,
  winsalotAppointmentTypeCopyLabel,
  winsalotReminderDisplayStatus,
  winsalotReminderErrorDetail,
  winsalotSmsReminderDisplayStatus,
  type WinsalotAppointmentReminderSettingsRow,
  type WinsalotAppointmentReminderRow,
  type WinsalotAppointmentRow,
  type WinsalotAppointmentSmsReminderRow,
  type WinsalotReminderType,
  type WinsalotReminderDisplayStatus,
  type WinsalotSmsRecipientType,
  type WinsalotSmsReminderStatusEntry,
} from "./winsalot-consultation-types";
import type { CrmLeadEmailRow } from "./crm-types";

const SMS_SETTINGS_TABLE = "winsalot_appointment_reminder_settings";
const SMS_SETTINGS_ID = "00000000-0000-0000-0000-000000000202";

const DEFAULT_SMS_SETTINGS: WinsalotAppointmentReminderSettingsRow = {
  id: SMS_SETTINGS_ID,
  automatic_sms_reminders_enabled: false,
  company_sms_notification_number: null,
  updated_at: new Date(0).toISOString(),
  updated_by_name: null,
};

export async function fetchWinsalotAppointmentReminderSettings(supabase: SupabaseClient): Promise<WinsalotAppointmentReminderSettingsRow> {
  const { data } = await supabase.from(SMS_SETTINGS_TABLE).select("*").maybeSingle();
  return (data as WinsalotAppointmentReminderSettingsRow | null) ?? DEFAULT_SMS_SETTINGS;
}

export async function updateWinsalotAppointmentReminderSettings(
  supabase: SupabaseClient,
  automaticSmsRemindersEnabled: boolean,
  updatedByName: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from(SMS_SETTINGS_TABLE)
    .update({ automatic_sms_reminders_enabled: automaticSmsRemindersEnabled, updated_at: new Date().toISOString(), updated_by_name: updatedByName })
    .eq("id", SMS_SETTINGS_ID);
  if (error) return { error: "Failed to update SMS reminder settings." };
  return {};
}

// Growth CRM's own "Company SMS Notification Number" (migration 0141) -
// Winsalot Corp's number for the immediate booking SMS and 24-hour/1-hour
// reminder SMS, admin-editable from /admin/crm/consultation-availability.
// Deliberately its own update function (not folded into the toggle above)
// since it has its own validation and is conceptually independent of
// whether *prospect* SMS reminders are switched on.
export async function updateWinsalotCompanySmsNotificationNumber(
  supabase: SupabaseClient,
  companySmsNotificationNumber: string | null,
  updatedByName: string
): Promise<{ error?: string }> {
  if (companySmsNotificationNumber && !isValidMobileNumber(companySmsNotificationNumber)) {
    return { error: "Enter a valid mobile number, or leave blank to turn off company SMS notifications." };
  }
  const { error } = await supabase
    .from(SMS_SETTINGS_TABLE)
    .update({
      company_sms_notification_number: companySmsNotificationNumber,
      updated_at: new Date().toISOString(),
      updated_by_name: updatedByName,
    })
    .eq("id", SMS_SETTINGS_ID);
  if (error) return { error: "Failed to update the Company SMS Notification Number." };
  return {};
}

// Automatic prospect-facing 24-hour and 1-hour consultation reminders.
// Same reliable architecture as the Lead Gen CRM's automatic business-
// facing reminder job (src/lib/leadgen-business-appointment-reminders.ts,
// migration 0068) - an occurrence-key dedup table claimed atomically
// before any email is sent, invoked roughly every 15 minutes by
// Supabase's pg_cron/pg_net rather than Vercel's once-a-day Hobby-plan
// cron (see supabase/migrations/0088's header) - but a fully independent
// table, cron route, secret, and recipient (the prospect, not a CRM
// client's own inbox).
//
// winsalot_appointments.appointment_start_at is already the one true UTC
// instant (unlike leadgen_appointments, which stores a business-timezone
// date+time pair that needs its own zonedWallTimeToUtcMs conversion), so
// this job never needs a timezone conversion step at all.

const REMINDER_TABLE = "winsalot_appointment_reminders";
const MAX_ATTEMPTS = 3;
const WINDOW_SLACK_MINUTES = 20;

const HOURS_BEFORE: Record<WinsalotReminderType, number> = {
  "24_hour_reminder": 24,
  "1_hour_reminder": 1,
};

async function claimReminderSlot(
  admin: SupabaseClient,
  appointmentId: string,
  reminderType: WinsalotReminderType,
  occurrenceKey: string,
  scheduledAppointmentAtIso: string
): Promise<string | null> {
  const { data: inserted, error: insertError } = await admin
    .from(REMINDER_TABLE)
    .insert({
      appointment_id: appointmentId,
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
    console.error("[winsalot-appointment-reminders] unexpected error claiming reminder slot:", insertError);
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

async function markReminderSent(
  admin: SupabaseClient,
  reminderId: string,
  recipientEmail: string,
  resendEmailId: string | null,
  crmLeadEmailId: string | null
): Promise<void> {
  await admin
    .from(REMINDER_TABLE)
    .update({
      status: "sent",
      recipient_email: recipientEmail,
      resend_email_id: resendEmailId,
      crm_lead_email_id: crmLeadEmailId,
      sent_at: new Date().toISOString(),
      error_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reminderId);
}

// Records the reminder send on crm_lead_emails - the same delivery-
// tracking table sendTrackedCrmEmail() (src/lib/send-crm-email.ts) writes
// to for every other Growth CRM email - so it shows up on Email Tracking
// (/admin/crm/emails) and the Resend webhook (src/app/api/webhooks/
// resend/route.ts, which checks crm_lead_emails.resend_email_id) keeps
// its delivered/opened/clicked/bounced/failed status current, instead of
// the send being visible only on winsalot_appointment_reminders. Returns
// null (and logs, never throws) on any failure here - the reminder itself
// already sent successfully at this point and must still be marked sent,
// so a tracking hiccup can't turn into a duplicate reminder on the next
// cron run.
// emailType/activityNote are the only things that differ between the
// automatic reminder job's own call (below) and the manual "Resend
// Appointment Notification" / "Send Appointment Reminder" actions
// (sendManualWinsalotAppointmentEmail) - same table, same tracking, same
// Resend webhook pipeline either way.
async function recordCrmLeadEmail(
  admin: SupabaseClient,
  appt: WinsalotAppointmentRow,
  emailType: "appointment_reminder" | "appointment_confirmation",
  resendEmailId: string,
  subject: string,
  sentAt: string,
  activityNote: string
): Promise<string | null> {
  if (!appt.opportunity_id) return null;

  const { data: tracked, error: trackingError } = await admin
    .from("crm_lead_emails")
    .insert({
      opportunity_id: appt.opportunity_id,
      agent_id: appt.assigned_agent_id,
      resend_email_id: resendEmailId,
      email_type: emailType,
      to_email: appt.email,
      subject,
      status: "sent",
      status_at: sentAt,
      sent_at: sentAt,
    })
    .select("id")
    .maybeSingle();

  if (trackingError || !tracked) {
    console.error(`[winsalot-appointment-reminders] failed to record crm_lead_emails for appointment ${appt.id}:`, trackingError);
    return null;
  }

  await admin.from("crm_activities").insert({
    opportunity_id: appt.opportunity_id,
    agent_id: appt.assigned_agent_id,
    activity_type: "email",
    notes: activityNote,
    occurred_at: sentAt,
  });

  return tracked.id as string;
}

export type WinsalotReminderJobResultOutcome = "sent" | "failed" | "skipped_claimed_elsewhere" | "would_send";

export type WinsalotReminderJobResult = {
  appointmentId: string;
  reminderType: WinsalotReminderType;
  businessName: string;
  scheduledAppointmentAtUtc: string;
  recipientEmail: string | null;
  outcome: WinsalotReminderJobResultOutcome;
  error?: string;
};

// SMS results (src/lib/appointment-sms.ts) - one entry per recipient
// type (prospect/admin) per eligible appointment/reminder_type,
// independent of the email outcome above.
export type WinsalotSmsReminderJobResult = {
  appointmentId: string;
  reminderType: WinsalotReminderType;
  recipientType: WinsalotSmsRecipientType;
  businessName: string;
  scheduledAppointmentAtUtc: string;
  recipientPhone: string | null;
  outcome: SmsOutcome;
  error?: string;
};

export type WinsalotReminderJobSummary = {
  dryRun: boolean;
  automaticSmsRemindersEnabled: boolean;
  candidatesScanned: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  results: WinsalotReminderJobResult[];
  smsSent: number;
  smsFailed: number;
  smsSkipped: number;
  smsResults: WinsalotSmsReminderJobResult[];
};

// Claims/sends the prospect reminder SMS (gated on
// automatic_sms_reminders_enabled/dryRun by the caller) and the Winsalot
// Corp company-notification SMS (sent independently of that toggle - see
// its own header comment below) for one appointment occurrence/
// reminder_type, folding both outcomes into the summary. Not implemented
// via the shared sendAppointmentReminderSmsPair (src/lib/appointment-sms.ts)
// because that helper hardcodes process.env.ADMIN_PHONE_NUMBER for its
// "admin" recipient and sends both recipients under one gate - Growth
// CRM needs its own Company SMS Notification Number (migration 0141) as
// the phone source, sent unconditionally, with the prospect reminder able
// to stay off independently. leadgen-appointment-reminders.ts still uses
// the shared pair helper unchanged.
async function recordWinsalotAppointmentSms(
  admin: SupabaseClient,
  summary: WinsalotReminderJobSummary,
  appt: WinsalotAppointmentRow,
  reminderType: WinsalotReminderType,
  occurrenceKey: string,
  scheduledMs: number,
  companySmsNotificationNumber: string | null,
  sendProspectReminder: boolean,
  dryRun: boolean
): Promise<void> {
  const timezone = appt.prospect_timezone || appt.business_timezone;
  const timeLabel = formatSmsTimeLabel(scheduledMs, timezone);
  const isToday = isAppointmentToday(scheduledMs, timezone, Date.now());

  const shared = {
    table: "winsalot_appointment_sms_reminders" as const,
    appointmentId: appt.id,
    reminderType,
    occurrenceKey,
    scheduledAppointmentAtIso: appt.appointment_start_at,
    dryRun,
  };

  const outcomes: [WinsalotSmsRecipientType, Awaited<ReturnType<typeof claimAndSendAppointmentSms>>][] = [];

  if (sendProspectReminder) {
    outcomes.push([
      "prospect",
      await claimAndSendAppointmentSms(admin, {
        ...shared,
        recipientType: "prospect",
        toPhoneRaw: appt.phone,
        consentGiven: appt.sms_consent,
        message: buildProspectReminderSms({
          businessName: appt.business_name,
          reminderType,
          timeLabel,
          appointmentTypeLabel: winsalotAppointmentTypeCopyLabel(appt.appointment_type),
        }),
      }),
    ]);
  }

  // Winsalot Corp's own reminder - never consent-gated (this is Winsalot's
  // internal notification, not a message to the prospect), and always
  // attempted regardless of sendProspectReminder/automatic_sms_reminders_enabled
  // - a missing/invalid company number is recorded "Skipped" by
  // claimAndSendAppointmentSms itself, never a hard failure.
  outcomes.push([
    "admin",
    await claimAndSendAppointmentSms(admin, {
      ...shared,
      recipientType: "admin",
      toPhoneRaw: companySmsNotificationNumber,
      consentGiven: true,
      message: buildAdminReminderSms({ crmLabel: "Growth", businessName: appt.business_name, contactName: appt.contact_name, isToday, timeLabel }),
    }),
  ]);

  for (const [recipientType, result] of outcomes) {
    if (result.outcome === "sent") summary.smsSent++;
    else if (result.outcome === "failed") summary.smsFailed++;
    else if (result.outcome !== "would_send") summary.smsSkipped++;

    summary.smsResults.push({
      appointmentId: appt.id,
      reminderType,
      recipientType,
      businessName: appt.business_name,
      scheduledAppointmentAtUtc: appt.appointment_start_at,
      recipientPhone: result.recipientPhone ?? null,
      outcome: result.outcome,
      error: result.error,
    });
  }
}

export async function runWinsalotAppointmentReminderJob(options?: { dryRun?: boolean }): Promise<WinsalotReminderJobSummary> {
  const dryRun = options?.dryRun ?? false;
  const admin = getSupabaseAdmin();
  // Email below is completely unaffected by this setting - it has always
  // run unconditionally whenever this job is invoked, and stays that way.
  // Only the SMS block at the end of the loop consults it.
  const smsSettings = await fetchWinsalotAppointmentReminderSettings(admin);

  const summary: WinsalotReminderJobSummary = {
    dryRun,
    automaticSmsRemindersEnabled: smsSettings.automatic_sms_reminders_enabled,
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

  const nowMs = Date.now();
  const slackMs = WINDOW_SLACK_MINUTES * 60 * 1000;
  // Coarse prefilter: any still-future booked appointment within the next
  // 25 hours could be due for one of the two reminders on this run.
  const horizonMs = nowMs + 25 * 60 * 60 * 1000;

  const { data: candidates, error: fetchError } = await admin
    .from("winsalot_appointments")
    .select("*")
    .eq("status", "booked")
    .gt("appointment_start_at", new Date(nowMs).toISOString())
    .lte("appointment_start_at", new Date(horizonMs).toISOString());

  if (fetchError) {
    console.error("[winsalot-appointment-reminders] failed to fetch candidate appointments:", fetchError);
    return summary;
  }

  const rows = (candidates ?? []) as WinsalotAppointmentRow[];
  summary.candidatesScanned = rows.length;

  for (const appt of rows) {
    const scheduledMs = new Date(appt.appointment_start_at).getTime();

    for (const reminderType of Object.keys(HOURS_BEFORE) as WinsalotReminderType[]) {
      const targetMs = scheduledMs - HOURS_BEFORE[reminderType] * 60 * 60 * 1000;
      if (Math.abs(nowMs - targetMs) > slackMs) continue;

      summary.eligible++;
      const occurrenceKey = winsalotAppointmentOccurrenceKey(appt.appointment_start_at);
      const resultBase = {
        appointmentId: appt.id,
        reminderType,
        businessName: appt.business_name,
        scheduledAppointmentAtUtc: appt.appointment_start_at,
      };

      // ---- Email (unchanged behavior/outcomes - restructured from
      // early `continue`s into if/else so the SMS block below always
      // still runs for this appointment/reminder_type). ----
      if (dryRun) {
        summary.results.push({ ...resultBase, recipientEmail: appt.email, outcome: "would_send" });
      } else {
        const reminderId = await claimReminderSlot(admin, appt.id, reminderType, occurrenceKey, appt.appointment_start_at);
        if (!reminderId) {
          summary.skipped++;
          summary.results.push({ ...resultBase, recipientEmail: null, outcome: "skipped_claimed_elsewhere" });
        } else {
          const rescheduleToken = await createWinsalotActionToken("reschedule", appt.id);
          const cancelToken = await createWinsalotActionToken("cancel", appt.id);
          const email = buildWinsalotReminderEmail({
            contactName: appt.contact_name,
            businessName: appt.business_name,
            serviceType: appt.service_type,
            appointmentType: appt.appointment_type,
            startUtcIso: appt.appointment_start_at,
            timezone: appt.prospect_timezone || appt.business_timezone,
            rescheduleUrl: `${getSiteUrl()}/book-consultation/reschedule/${rescheduleToken}`,
            cancelUrl: `${getSiteUrl()}/book-consultation/cancel/${cancelToken}`,
            reminderType,
          });

          try {
            const resend = getResendClient();
            const { data: sendResult, error: sendError } = await resend.emails.send({
              from: getEmailSender("growth"),
              to: appt.email,
              replyTo: getEmailReplyTo(),
              subject: email.subject,
              text: email.text,
              html: email.html,
            });

            if (sendError || !sendResult) {
              const errorDetail = sendError?.message ?? "Unknown Resend error.";
              await markReminderFailed(admin, reminderId, errorDetail);
              summary.failed++;
              summary.results.push({ ...resultBase, recipientEmail: appt.email, outcome: "failed", error: errorDetail });
            } else {
              const sentAt = new Date().toISOString();
              const hoursLabel = reminderType === "24_hour_reminder" ? "24-hour" : "1-hour";
              const crmLeadEmailId = await recordCrmLeadEmail(
                admin,
                appt,
                "appointment_reminder",
                sendResult.id,
                email.subject,
                sentAt,
                `Automatic ${hoursLabel} consultation reminder sent to ${appt.email}.`
              );
              await markReminderSent(admin, reminderId, appt.email, sendResult.id, crmLeadEmailId);
              summary.sent++;
              summary.results.push({ ...resultBase, recipientEmail: appt.email, outcome: "sent" });
            }
          } catch (err) {
            const errorDetail = err instanceof Error ? err.message : "Unknown error sending reminder.";
            await markReminderFailed(admin, reminderId, errorDetail);
            summary.failed++;
            summary.results.push({ ...resultBase, recipientEmail: appt.email, outcome: "failed", error: errorDetail });
          }
        }
      }

      // ---- SMS (independent of every email outcome above). The prospect
      // reminder stays gated on automatic_sms_reminders_enabled/dryRun,
      // unchanged from before; Winsalot Corp's own company notification is
      // always attempted regardless of that toggle - see
      // recordWinsalotAppointmentSms's header comment. Email above is
      // unconditional and untouched by either. ----
      await recordWinsalotAppointmentSms(
        admin,
        summary,
        appt,
        reminderType,
        occurrenceKey,
        scheduledMs,
        smsSettings.company_sms_notification_number,
        dryRun || smsSettings.automatic_sms_reminders_enabled,
        dryRun
      );
    }
  }

  return summary;
}

// Display status for the admin/agent appointment views. Delivery status
// comes from the existing crm_lead_emails + Resend webhook pipeline,
// matching the Lead Gen reminder badges without creating another sender
// or scheduler.
export type WinsalotReminderStatusEntry = {
  reminder24h: WinsalotReminderDisplayStatus;
  reminder1h: WinsalotReminderDisplayStatus;
  // The Resend/claim failure reason (winsalot_appointment_reminders.error_detail)
  // for the failed reminder type, if any - null whenever that reminder
  // isn't in a "failed" state. Lets the admin/agent appointment list show
  // *why* a reminder failed instead of just a bare "Failed" badge.
  reminder24hError: string | null;
  reminder1hError: string | null;
};

export async function fetchWinsalotReminderStatusMap(
  _supabase: SupabaseClient,
  appointments: Pick<WinsalotAppointmentRow, "id" | "status" | "appointment_start_at">[]
): Promise<Record<string, WinsalotReminderStatusEntry>> {
  if (appointments.length === 0) return {};

  const nowMs = Date.now();
  const appointmentIds = appointments.map((a) => a.id);
  // These two delivery bookkeeping tables intentionally use service-role
  // RLS. The caller has already supplied only appointments visible to the
  // current admin/agent page, so this lookup cannot widen appointment
  // access; it only enriches those authorized rows with their statuses.
  const admin = getSupabaseAdmin();
  const { data: reminderRows } = await admin.from(REMINDER_TABLE).select("*").in("appointment_id", appointmentIds);
  const reminders = (reminderRows ?? []) as WinsalotAppointmentReminderRow[];

  const byAppointment = new Map<string, WinsalotAppointmentReminderRow[]>();
  for (const r of reminders) {
    const list = byAppointment.get(r.appointment_id) ?? [];
    list.push(r);
    byAppointment.set(r.appointment_id, list);
  }

  const trackedEmailIds = reminders.map((r) => r.crm_lead_email_id).filter((id): id is string => !!id);
  const { data: trackedEmailRows } = trackedEmailIds.length
    ? await admin.from("crm_lead_emails").select("*").in("id", trackedEmailIds)
    : { data: [] as CrmLeadEmailRow[] };
  const trackedEmailById = new Map(((trackedEmailRows ?? []) as CrmLeadEmailRow[]).map((email) => [email.id, email]));

  const result: Record<string, WinsalotReminderStatusEntry> = {};
  for (const appt of appointments) {
    const occurrenceKey = winsalotAppointmentOccurrenceKey(appt.appointment_start_at);
    const current = (byAppointment.get(appt.id) ?? []).filter((r) => r.occurrence_key === occurrenceKey);
    const r24 = current.find((r) => r.reminder_type === "24_hour_reminder") ?? null;
    const r1 = current.find((r) => r.reminder_type === "1_hour_reminder") ?? null;
    const email24 = r24?.crm_lead_email_id ? (trackedEmailById.get(r24.crm_lead_email_id) ?? null) : null;
    const email1 = r1?.crm_lead_email_id ? (trackedEmailById.get(r1.crm_lead_email_id) ?? null) : null;
    const isEligible = appt.status === "booked" && new Date(appt.appointment_start_at).getTime() > nowMs;
    result[appt.id] = {
      reminder24h: winsalotReminderDisplayStatus(r24, email24, isEligible),
      reminder1h: winsalotReminderDisplayStatus(r1, email1, isEligible),
      reminder24hError: winsalotReminderErrorDetail(r24, email24),
      reminder1hError: winsalotReminderErrorDetail(r1, email1),
    };
  }
  return result;
}

// SMS counterpart to fetchWinsalotReminderStatusMap above - reads
// winsalot_appointment_sms_reminders' prospect-recipient rows only (the
// admin notification's own rows aren't shown on a per-appointment badge).
export async function fetchWinsalotSmsReminderStatusMap(
  supabase: SupabaseClient,
  appointments: Pick<WinsalotAppointmentRow, "id" | "status" | "appointment_start_at" | "sms_consent" | "phone">[]
): Promise<Record<string, WinsalotSmsReminderStatusEntry>> {
  if (appointments.length === 0) return {};

  const smsSettings = await fetchWinsalotAppointmentReminderSettings(supabase);
  const nowMs = Date.now();
  const appointmentIds = appointments.map((a) => a.id);
  const { data: reminderRows } = await supabase
    .from("winsalot_appointment_sms_reminders")
    .select("*")
    .eq("recipient_type", "prospect")
    .in("appointment_id", appointmentIds);
  const reminders = (reminderRows ?? []) as WinsalotAppointmentSmsReminderRow[];

  const byAppointment = new Map<string, WinsalotAppointmentSmsReminderRow[]>();
  for (const r of reminders) {
    const list = byAppointment.get(r.appointment_id) ?? [];
    list.push(r);
    byAppointment.set(r.appointment_id, list);
  }

  const result: Record<string, WinsalotSmsReminderStatusEntry> = {};
  for (const appt of appointments) {
    const occurrenceKey = winsalotAppointmentOccurrenceKey(appt.appointment_start_at);
    const current = (byAppointment.get(appt.id) ?? []).filter((r) => r.occurrence_key === occurrenceKey);
    const r24 = current.find((r) => r.reminder_type === "24_hour_reminder") ?? null;
    const r1 = current.find((r) => r.reminder_type === "1_hour_reminder") ?? null;

    const isEligible =
      smsSettings.automatic_sms_reminders_enabled &&
      appt.status === "booked" &&
      appt.sms_consent &&
      !!appt.phone &&
      new Date(appt.appointment_start_at).getTime() > nowMs;

    result[appt.id] = {
      status24h: winsalotSmsReminderDisplayStatus(r24, isEligible),
      errorDetail24h: r24 && ["failed", "skipped", "opted_out"].includes(r24.status) ? r24.error_detail : null,
      status1h: winsalotSmsReminderDisplayStatus(r1, isEligible),
      errorDetail1h: r1 && ["failed", "skipped", "opted_out"].includes(r1.status) ? r1.error_detail : null,
    };
  }
  return result;
}

// ---------------------------------------------------------------------
// Manual "Resend Appointment Notification" / "Send Appointment Reminder"
// (the same two admin/agent actions Lead Gen CRM already has - see
// leadgen-appointment-reminders.ts's sendManualLeadgenAppointmentSms /
// leadgen-appointment-emails.ts's sendLeadgenAppointmentEmail). Reuses
// the exact same Resend client, sender, and email templates
// (buildWinsalotConfirmationEmail / buildWinsalotReminderEmail) as every
// other Growth CRM email, and the same crm_lead_emails delivery-tracking
// table + Resend webhook pipeline the automatic reminder job above
// already writes to via recordCrmLeadEmail - never a new table, sender,
// or template.
// ---------------------------------------------------------------------

export type WinsalotManualEmailResult = { error?: string; crmLeadEmailId?: string };

export async function sendManualWinsalotAppointmentEmail(
  admin: SupabaseClient,
  appointmentId: string,
  kind: "resend_confirmation" | "reminder",
  actorName: string
): Promise<WinsalotManualEmailResult> {
  const { data: apptRow } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!apptRow) return { error: "Appointment not found." };
  const appt = apptRow as WinsalotAppointmentRow;

  const rescheduleToken = await createWinsalotActionToken("reschedule", appt.id);
  const cancelToken = await createWinsalotActionToken("cancel", appt.id);
  const timezone = appt.prospect_timezone || appt.business_timezone;
  const shared = {
    contactName: appt.contact_name,
    businessName: appt.business_name,
    serviceType: appt.service_type,
    appointmentType: appt.appointment_type,
    startUtcIso: appt.appointment_start_at,
    timezone,
    rescheduleUrl: `${getSiteUrl()}/book-consultation/reschedule/${rescheduleToken}`,
    cancelUrl: `${getSiteUrl()}/book-consultation/cancel/${cancelToken}`,
  };

  const email = kind === "resend_confirmation" ? buildWinsalotConfirmationEmail(shared) : buildWinsalotReminderEmail({ ...shared, reminderType: "24_hour_reminder" });

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: getEmailSender("growth"),
      to: appt.email,
      replyTo: getEmailReplyTo(),
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (sendError || !sendResult) {
      return { error: sendError?.message ?? "Unknown Resend error." };
    }

    const sentAt = new Date().toISOString();
    const activityNote =
      kind === "resend_confirmation"
        ? `Appointment confirmation resent to ${appt.email} by ${actorName}.`
        : `Appointment reminder sent to ${appt.email} by ${actorName}.`;
    const crmLeadEmailId = await recordCrmLeadEmail(
      admin,
      appt,
      kind === "resend_confirmation" ? "appointment_confirmation" : "appointment_reminder",
      sendResult.id,
      email.subject,
      sentAt,
      activityNote
    );

    return { crmLeadEmailId: crmLeadEmailId ?? undefined };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error sending email." };
  }
}

// SMS counterpart to sendManualWinsalotAppointmentEmail above - reuses
// claimAndSendAppointmentSms and the same prospect-facing SMS templates
// as the automatic job (recordWinsalotAppointmentSms), gated on the same
// automatic_sms_reminders_enabled toggle, under a fresh, always-unique
// occurrence key per click so a manual send is never silently deduped
// against the automatic job's own claim for this occurrence, and never
// affects the 24h/1h automatic reminder status badges.
export async function sendManualWinsalotAppointmentSms(
  admin: SupabaseClient,
  appointment: WinsalotAppointmentRow,
  kind: "resend_confirmation" | "reminder"
): Promise<ManualSmsResult> {
  const smsSettings = await fetchWinsalotAppointmentReminderSettings(admin);
  if (!smsSettings.automatic_sms_reminders_enabled) return { outcome: "disabled" };

  const timezone = appointment.prospect_timezone || appointment.business_timezone;
  const scheduledMs = new Date(appointment.appointment_start_at).getTime();
  const timeLabel = formatSmsTimeLabel(scheduledMs, timezone);
  const appointmentTypeLabel = winsalotAppointmentTypeCopyLabel(appointment.appointment_type);

  const message =
    kind === "resend_confirmation"
      ? buildAppointmentConfirmationSms({
          businessName: appointment.business_name,
          dateLabel: formatSmsDateLabel(scheduledMs, timezone),
          timeLabel,
          appointmentTypeLabel,
        })
      : buildProspectReminderSms({ businessName: appointment.business_name, reminderType: "24_hour_reminder", timeLabel, appointmentTypeLabel });

  const result = await claimAndSendAppointmentSms(admin, {
    table: "winsalot_appointment_sms_reminders",
    appointmentId: appointment.id,
    reminderType: kind === "resend_confirmation" ? "24_hour_reminder" : "1_hour_reminder",
    recipientType: "prospect",
    occurrenceKey: `manual_${kind}:${Date.now()}`,
    scheduledAppointmentAtIso: appointment.appointment_start_at,
    toPhoneRaw: appointment.phone,
    consentGiven: appointment.sms_consent,
    message,
    dryRun: false,
  });

  return { outcome: result.outcome, error: result.error };
}
