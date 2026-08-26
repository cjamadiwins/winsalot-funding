import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getEmailReplyTo, getEmailSender } from "./email-senders";
import { getSiteUrl } from "./site-url";
import { createWinsalotActionToken } from "./winsalot-consultation-tokens";
import { buildWinsalotReminderEmail } from "./winsalot-consultation-emails";
import { winsalotAppointmentOccurrenceKey, type WinsalotAppointmentRow, type WinsalotReminderType } from "./winsalot-consultation-types";

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

async function markReminderSent(admin: SupabaseClient, reminderId: string, recipientEmail: string, resendEmailId: string | null): Promise<void> {
  await admin
    .from(REMINDER_TABLE)
    .update({
      status: "sent",
      recipient_email: recipientEmail,
      resend_email_id: resendEmailId,
      sent_at: new Date().toISOString(),
      error_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reminderId);
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

export type WinsalotReminderJobSummary = {
  dryRun: boolean;
  candidatesScanned: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  results: WinsalotReminderJobResult[];
};

export async function runWinsalotAppointmentReminderJob(options?: { dryRun?: boolean }): Promise<WinsalotReminderJobSummary> {
  const dryRun = options?.dryRun ?? false;
  const admin = getSupabaseAdmin();

  const summary: WinsalotReminderJobSummary = {
    dryRun,
    candidatesScanned: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
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

      if (dryRun) {
        summary.results.push({ ...resultBase, recipientEmail: appt.email, outcome: "would_send" });
        continue;
      }

      const reminderId = await claimReminderSlot(admin, appt.id, reminderType, occurrenceKey, appt.appointment_start_at);
      if (!reminderId) {
        summary.skipped++;
        summary.results.push({ ...resultBase, recipientEmail: null, outcome: "skipped_claimed_elsewhere" });
        continue;
      }

      const rescheduleToken = await createWinsalotActionToken("reschedule", appt.id);
      const cancelToken = await createWinsalotActionToken("cancel", appt.id);
      const email = buildWinsalotReminderEmail({
        contactName: appt.contact_name,
        businessName: appt.business_name,
        serviceType: appt.service_type,
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
          continue;
        }

        await markReminderSent(admin, reminderId, appt.email, sendResult.id);
        summary.sent++;
        summary.results.push({ ...resultBase, recipientEmail: appt.email, outcome: "sent" });
      } catch (err) {
        const errorDetail = err instanceof Error ? err.message : "Unknown error sending reminder.";
        await markReminderFailed(admin, reminderId, errorDetail);
        summary.failed++;
        summary.results.push({ ...resultBase, recipientEmail: appt.email, outcome: "failed", error: errorDetail });
      }
    }
  }

  return summary;
}

// Display status for the admin/agent appointment views - "Scheduled" /
// "Sent" / "Failed" per reminder type, for the appointment's *current*
// occurrence (a reschedule invalidates the previous occurrence's rows
// for this purpose, same as leadgen's equivalent).
export async function fetchWinsalotReminderStatusMap(
  supabase: SupabaseClient,
  appointments: Pick<WinsalotAppointmentRow, "id" | "status" | "appointment_start_at">[]
): Promise<Record<string, { reminder24h: "scheduled" | "sent" | "failed"; reminder1h: "scheduled" | "sent" | "failed" }>> {
  if (appointments.length === 0) return {};

  const appointmentIds = appointments.map((a) => a.id);
  const { data: reminderRows } = await supabase.from(REMINDER_TABLE).select("*").in("appointment_id", appointmentIds);
  const reminders = (reminderRows ?? []) as { appointment_id: string; reminder_type: WinsalotReminderType; occurrence_key: string; status: string }[];

  const byAppointment = new Map<string, typeof reminders>();
  for (const r of reminders) {
    const list = byAppointment.get(r.appointment_id) ?? [];
    list.push(r);
    byAppointment.set(r.appointment_id, list);
  }

  const result: Record<string, { reminder24h: "scheduled" | "sent" | "failed"; reminder1h: "scheduled" | "sent" | "failed" }> = {};
  for (const appt of appointments) {
    const occurrenceKey = winsalotAppointmentOccurrenceKey(appt.appointment_start_at);
    const current = (byAppointment.get(appt.id) ?? []).filter((r) => r.occurrence_key === occurrenceKey);
    const r24 = current.find((r) => r.reminder_type === "24_hour_reminder");
    const r1 = current.find((r) => r.reminder_type === "1_hour_reminder");
    result[appt.id] = {
      reminder24h: (r24?.status as "sent" | "failed") ?? "scheduled",
      reminder1h: (r1?.status as "sent" | "failed") ?? "scheduled",
    };
  }
  return result;
}
