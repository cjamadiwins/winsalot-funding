import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTrackedSmsToNumber, toE164 } from "./twilio";

// Shared SMS appointment-reminder machinery used by both CRMs'
// prospect-facing reminder jobs (src/lib/leadgen-appointment-reminders.ts,
// src/lib/winsalot-consultation-reminders.ts) and, within those same
// jobs, the internal admin notification. Unlike the email side of this
// codebase (which deliberately keeps each CRM's reminder logic as its
// own self-contained file rather than unifying it), the SMS claim/send/
// record loop really is identical work for both CRMs - only the table
// name, and whether a lead_id exists to attach, differ - so it lives
// here once rather than being duplicated twice.

export type SmsReminderType = "24_hour_reminder" | "1_hour_reminder";
// "client" (the leadgen_clients.sms_notification_number recipient - see
// migration 0140) is leadgen-only: winsalot_appointment_sms_reminders'
// own check constraint still only allows 'prospect'/'admin', so passing
// "client" with table "winsalot_appointment_sms_reminders" would fail at
// the database rather than silently succeeding.
export type SmsRecipientType = "prospect" | "admin" | "client";
export type SmsReminderTable = "leadgen_appointment_sms_reminders" | "winsalot_appointment_sms_reminders";

export type SmsOutcome =
  | "sent"
  | "failed"
  | "skipped_claimed_elsewhere"
  | "skipped_no_consent"
  | "skipped_no_phone"
  | "skipped_invalid_phone"
  | "skipped_opted_out"
  | "would_send";

const MAX_FAILED_ATTEMPTS = 3;
const SMS_SEGMENT_LIMIT = 160;

// ---------------------------------------------------------------------
// Phone validation - same 10-digit-NANP / 11-digit-with-leading-1 /
// already-E.164 assumptions as twilio.ts's own toE164, so a number this
// says is valid always converts to a sane E.164 value.
// ---------------------------------------------------------------------
export function isValidMobileNumber(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const digitsAndPlus = trimmed.replace(/[^\d+]/g, "");
  if (digitsAndPlus.startsWith("+")) {
    const bareDigits = digitsAndPlus.slice(1);
    return bareDigits.length >= 8 && bareDigits.length <= 15;
  }
  if (digitsAndPlus.length === 10) return true;
  if (digitsAndPlus.length === 11 && digitsAndPlus.startsWith("1")) return true;
  return false;
}

// ---------------------------------------------------------------------
// Opt-out (STOP/START) lookup - see supabase/migrations/0125 for why
// sms_opt_outs is keyed by phone number alone rather than per-CRM, and
// src/app/api/webhooks/twilio/inbound/route.ts for what writes it.
// opted_in_at/opted_out_at are independent timestamps (never nulled out
// by the other event) so whichever happened most recently wins - a
// START after a STOP un-opts-out without losing the original opt-out's
// own history, and vice versa.
// ---------------------------------------------------------------------
export async function isPhoneOptedOut(admin: SupabaseClient, phoneE164: string): Promise<boolean> {
  const { data } = await admin.from("sms_opt_outs").select("opted_out_at, opted_in_at").eq("phone_e164", phoneE164).maybeSingle();
  if (!data?.opted_out_at) return false;
  const optedOutMs = new Date(data.opted_out_at as string).getTime();
  const optedInMs = data.opted_in_at ? new Date(data.opted_in_at as string).getTime() : -Infinity;
  return optedOutMs > optedInMs;
}

export async function recordSmsOptOut(admin: SupabaseClient, phoneE164: string, keyword: string, sourceCrm: "leadgen" | "growth"): Promise<void> {
  await admin
    .from("sms_opt_outs")
    .upsert(
      { phone_e164: phoneE164, opted_out_at: new Date().toISOString(), last_keyword: keyword, last_source_crm: sourceCrm, updated_at: new Date().toISOString() },
      { onConflict: "phone_e164" }
    );
}

export async function recordSmsOptIn(admin: SupabaseClient, phoneE164: string, keyword: string, sourceCrm: "leadgen" | "growth"): Promise<void> {
  await admin
    .from("sms_opt_outs")
    .upsert(
      { phone_e164: phoneE164, opted_in_at: new Date().toISOString(), last_keyword: keyword, last_source_crm: sourceCrm, updated_at: new Date().toISOString() },
      { onConflict: "phone_e164" }
    );
}

// Twilio's standard Advanced Opt-Out keyword set
// (https://www.twilio.com/docs/messaging/features/opt-out-management) -
// matched case-insensitively against the ENTIRE trimmed message body
// (not a substring match), same as Twilio's own handling, so a real
// reply like "please stop calling" is never misread as an opt-out.
export const SMS_STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
export const SMS_START_KEYWORDS = new Set(["start", "unstop", "yes"]);

// ---------------------------------------------------------------------
// Message builders - single SMS segment (160 GSM-7 chars) whenever
// possible, per the brief. The compliance suffix ("Reply STOP to opt
// out.") is never truncated; only the variable business/contact name is
// shortened, and only as a last resort.
// ---------------------------------------------------------------------
export function formatSmsTimeLabel(scheduledMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(scheduledMs));
}

// Whether `scheduledMs` falls on the same calendar date as `nowMs`, as
// read on a wall clock in `timeZone` - used to pick "today" vs
// "tomorrow" in the reminder copy from the prospect's own appointment
// timezone, not server/UTC time.
export function isAppointmentToday(scheduledMs: number, timeZone: string, nowMs: number): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date(scheduledMs)) === fmt.format(new Date(nowMs));
}

function shrinkToFit(build: (name: string) => string, name: string): string {
  let candidate = name.trim() || "your business";
  let message = build(candidate);
  while (message.length > SMS_SEGMENT_LIMIT && candidate.length > 1) {
    candidate = candidate.slice(0, -2).trimEnd() + "…";
    message = build(candidate);
  }
  return message;
}

export function buildProspectReminderSms(params: { businessName: string; reminderType: SmsReminderType; timeLabel: string }): string {
  const leadTime = params.reminderType === "24_hour_reminder" ? "24 hours" : "1 hour";
  return shrinkToFit(
    (name) => `Winsalot Corp.: Your phone call appointment with ${name} is in ${leadTime} at ${params.timeLabel}. STOP to opt out.`,
    params.businessName
  );
}

export function formatSmsDateLabel(scheduledMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(new Date(scheduledMs));
}

export function buildAppointmentConfirmationSms(params: { businessName: string; dateLabel: string; timeLabel: string }): string {
  return shrinkToFit(
    (name) => `Winsalot Corp.: Your phone call appointment with ${name} is confirmed for ${params.dateLabel} at ${params.timeLabel}. STOP to opt out.`,
    params.businessName
  );
}

export function buildAdminReminderSms(params: {
  crmLabel: "Growth" | "Lead Gen";
  businessName: string;
  contactName: string | null;
  isToday: boolean;
  timeLabel: string;
}): string {
  const when = params.isToday ? "today" : "tomorrow";
  // businessName and contactName are shrunk together as one composed
  // label (not businessName alone) - a long contactName must also be
  // truncatable, or the message could still blow past one segment even
  // after businessName has shrunk to nothing.
  const label = params.businessName.trim() + (params.contactName?.trim() ? ` (${params.contactName.trim()})` : "");
  return shrinkToFit((name) => `Winsalot ${params.crmLabel} admin alert: appt with ${name} is ${when} at ${params.timeLabel}.`, label);
}

// ---------------------------------------------------------------------
// Client/business-facing messages (leadgen only - see the 'client'
// recipient type above) - the CRM client itself (e.g. Brent's
// Essentials, Mantra Collab) being told about a prospect's appointment
// with them. Never consent/opt-out-gated, same as the admin channel:
// leadgen_clients.sms_notification_number is entered by an admin on the
// client's own record, not collected from an SMS-replying member of the
// public.
// ---------------------------------------------------------------------

// Weekday + short month + day (e.g. "Friday, Sep 5") for the immediate
// booking SMS - distinct from formatSmsDateLabel above (which omits the
// weekday) because the brief's exact example for this message includes it.
export function formatSmsDateWithWeekdayLabel(scheduledMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" }).format(new Date(scheduledMs));
}

// Immediate on-booking SMS to the client/business - deliberately not run
// through shrinkToFit/SMS_SEGMENT_LIMIT like every message above: this is
// a multi-line notification (business name, prospect name, date/time,
// prospect phone, "Booked by Winsalot Corp.") per the brief's exact
// format, and getting that format right matters more here than staying
// within one 160-char SMS segment - Twilio transparently sends a longer
// body as a multi-part message.
export function buildClientAppointmentBookingSms(params: {
  businessName: string;
  prospectName: string | null;
  dateLabel: string;
  timeLabel: string;
  prospectPhone: string | null;
}): string {
  const lines = [
    `New appointment booked for ${params.businessName.trim() || "your business"}`,
    params.prospectName?.trim() || "New prospect",
    `${params.dateLabel} at ${params.timeLabel}`,
  ];
  if (params.prospectPhone?.trim()) lines.push(`Phone: ${params.prospectPhone.trim()}`);
  lines.push("Booked by Winsalot Corp.");
  return lines.join("\n");
}

// 24-hour/1-hour reminder SMS to the client/business - single segment
// where possible, per the brief's example
// ("Reminder: Brent's Essentials has an appointment with John Smith
// tomorrow at 12:00 PM."). Shrinks the prospect name first (it's the more
// disposable half of the sentence for a business reading its own
// reminder), then the business name itself, only as a last resort.
export function buildClientAppointmentReminderSms(params: { businessName: string; prospectName: string | null; isToday: boolean; timeLabel: string }): string {
  const when = params.isToday ? "today" : "tomorrow";
  let businessName = params.businessName.trim() || "Your business";
  let prospectName = params.prospectName?.trim() || "a prospect";
  let message = `Reminder: ${businessName} has an appointment with ${prospectName} ${when} at ${params.timeLabel}.`;
  while (message.length > SMS_SEGMENT_LIMIT && (prospectName.length > 1 || businessName.length > 1)) {
    if (prospectName.length > 1) prospectName = prospectName.slice(0, -2).trimEnd() + "…";
    else businessName = businessName.slice(0, -2).trimEnd() + "…";
    message = `Reminder: ${businessName} has an appointment with ${prospectName} ${when} at ${params.timeLabel}.`;
  }
  return message;
}

// ---------------------------------------------------------------------
// Claim + send - same atomic-insert-then-conditional-retry technique as
// every existing email reminder table in this codebase (see
// leadgen-appointment-reminders.ts / winsalot-consultation-reminders.ts),
// extended with two more terminal-but-harmless states ('skipped',
// 'opted_out') that, unlike 'failed', are always safe to re-evaluate on
// a later run with no attempt cap - neither one ever sent a real
// message, so re-checking costs nothing and lets a later consent/phone/
// opt-out change still produce a send before the appointment passes.
// 'sending'/'sent'/'delivered' are never retried under any
// circumstances - those either are in flight right now or already went
// out for real.
// ---------------------------------------------------------------------

type ClaimParams = {
  table: SmsReminderTable;
  appointmentId: string;
  leadId?: string | null;
  reminderType: SmsReminderType;
  recipientType: SmsRecipientType;
  occurrenceKey: string;
  scheduledAppointmentAtIso: string;
};

async function claimSmsReminderSlot(admin: SupabaseClient, params: ClaimParams): Promise<string | null> {
  const insertRow: Record<string, unknown> = {
    appointment_id: params.appointmentId,
    reminder_type: params.reminderType,
    recipient_type: params.recipientType,
    occurrence_key: params.occurrenceKey,
    scheduled_appointment_at: params.scheduledAppointmentAtIso,
    status: "sending",
    attempt_count: 1,
  };
  if (params.table === "leadgen_appointment_sms_reminders") insertRow.lead_id = params.leadId ?? null;

  const { data: inserted, error: insertError } = await admin.from(params.table).insert(insertRow).select("id").maybeSingle();
  if (inserted) return inserted.id as string;
  if (insertError && insertError.code !== "23505") {
    console.error(`[appointment-sms] unexpected error claiming ${params.table} slot:`, insertError);
    return null;
  }

  const { data: existing } = await admin
    .from(params.table)
    .select("id, status, attempt_count")
    .eq("appointment_id", params.appointmentId)
    .eq("reminder_type", params.reminderType)
    .eq("recipient_type", params.recipientType)
    .eq("occurrence_key", params.occurrenceKey)
    .maybeSingle();

  if (!existing) return null;
  if (existing.status === "failed" && existing.attempt_count >= MAX_FAILED_ATTEMPTS) return null;
  if (!["failed", "skipped", "opted_out"].includes(existing.status)) return null;

  const { data: retried } = await admin
    .from(params.table)
    .update({ status: "sending", attempt_count: existing.attempt_count + 1, error_detail: null, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("status", existing.status)
    .eq("attempt_count", existing.attempt_count)
    .select("id")
    .maybeSingle();

  return retried ? (retried.id as string) : null;
}

async function markSmsTerminal(
  admin: SupabaseClient,
  table: SmsReminderTable,
  id: string,
  status: "skipped" | "opted_out" | "failed",
  errorDetail: string
): Promise<void> {
  await admin.from(table).update({ status, error_detail: errorDetail, updated_at: new Date().toISOString() }).eq("id", id);
}

async function markSmsSent(
  admin: SupabaseClient,
  table: SmsReminderTable,
  id: string,
  recipientPhone: string,
  sid: string,
  twilioStatus: string
): Promise<void> {
  await admin
    .from(table)
    .update({
      status: "sent",
      recipient_phone: recipientPhone,
      twilio_message_sid: sid,
      twilio_status: twilioStatus,
      sent_at: new Date().toISOString(),
      error_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export type SendAppointmentSmsParams = {
  table: SmsReminderTable;
  appointmentId: string;
  leadId?: string | null;
  reminderType: SmsReminderType;
  recipientType: SmsRecipientType;
  occurrenceKey: string;
  scheduledAppointmentAtIso: string;
  // Raw phone as stored on the appointment (prospect) or
  // process.env.ADMIN_PHONE_NUMBER (admin) - null if not on file
  // / not configured.
  toPhoneRaw: string | null;
  // Ignored for recipientType "admin" - the internal notification is
  // never consent-gated, per the brief.
  consentGiven: boolean;
  message: string;
  dryRun: boolean;
};

export async function claimAndSendAppointmentSms(
  admin: SupabaseClient,
  opts: SendAppointmentSmsParams
): Promise<{ outcome: SmsOutcome; error?: string; recipientPhone?: string | null }> {
  const requiresConsent = opts.recipientType === "prospect";
  const noPhoneDetail =
    opts.recipientType === "admin"
      ? "ADMIN_PHONE_NUMBER is not configured."
      : opts.recipientType === "client"
        ? "No SMS Notification Number on file for this client."
        : "No mobile number on file.";

  if (opts.dryRun) {
    if (requiresConsent && !opts.consentGiven) return { outcome: "skipped_no_consent" };
    if (!opts.toPhoneRaw) return { outcome: "skipped_no_phone" };
    if (!isValidMobileNumber(opts.toPhoneRaw)) return { outcome: "skipped_invalid_phone" };
    const phoneE164 = toE164(opts.toPhoneRaw);
    if (requiresConsent && (await isPhoneOptedOut(admin, phoneE164))) return { outcome: "skipped_opted_out", recipientPhone: phoneE164 };
    return { outcome: "would_send", recipientPhone: phoneE164 };
  }

  const reminderId = await claimSmsReminderSlot(admin, opts);
  if (!reminderId) return { outcome: "skipped_claimed_elsewhere" };

  if (requiresConsent && !opts.consentGiven) {
    await markSmsTerminal(admin, opts.table, reminderId, "skipped", "No SMS reminder consent on file.");
    return { outcome: "skipped_no_consent" };
  }
  if (!opts.toPhoneRaw) {
    await markSmsTerminal(admin, opts.table, reminderId, "skipped", noPhoneDetail);
    return { outcome: "skipped_no_phone" };
  }
  if (!isValidMobileNumber(opts.toPhoneRaw)) {
    await markSmsTerminal(admin, opts.table, reminderId, "skipped", "Saved phone number is not a valid mobile number.");
    return { outcome: "skipped_invalid_phone" };
  }

  const phoneE164 = toE164(opts.toPhoneRaw);

  if (requiresConsent && (await isPhoneOptedOut(admin, phoneE164))) {
    await markSmsTerminal(admin, opts.table, reminderId, "opted_out", "This phone number has opted out of SMS (STOP).");
    return { outcome: "skipped_opted_out", recipientPhone: phoneE164 };
  }

  try {
    const result = await sendTrackedSmsToNumber(phoneE164, opts.message);
    await markSmsSent(admin, opts.table, reminderId, phoneE164, result.sid, result.status);
    return { outcome: "sent", recipientPhone: phoneE164 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error sending SMS.";
    await markSmsTerminal(admin, opts.table, reminderId, "failed", detail);
    return { outcome: "failed", error: detail, recipientPhone: phoneE164 };
  }
}

// Immediate, prospect-facing confirmation used by every successful booking
// path in both CRMs. It deliberately uses the same claim table, Twilio sender,
// STOP lookup, and delivery callback as scheduled reminders. The unique claim
// makes a retried server action harmless: the same appointment can only send
// one confirmation for its current scheduled occurrence.
export async function sendImmediateAppointmentConfirmation(
  admin: SupabaseClient,
  params: {
    table: SmsReminderTable;
    appointmentId: string;
    leadId?: string | null;
    scheduledAppointmentAtIso: string;
    timezone: string;
    prospectPhone: string | null;
    prospectConsent: boolean;
    businessName: string;
  }
): Promise<{ outcome: SmsOutcome; error?: string; recipientPhone?: string | null }> {
  const scheduledMs = new Date(params.scheduledAppointmentAtIso).getTime();
  const timeLabel = formatSmsTimeLabel(scheduledMs, params.timezone);
  const dateLabel = formatSmsDateLabel(scheduledMs, params.timezone);

  return claimAndSendAppointmentSms(admin, {
    table: params.table,
    appointmentId: params.appointmentId,
    leadId: params.leadId,
    // Keep the existing database enum unchanged. The confirmation is
    // distinguished from the real 1-hour reminder by its prefixed occurrence
    // key, which is also part of the unique claim. This makes the feature
    // deployable without a separate Supabase migration.
    reminderType: "1_hour_reminder",
    recipientType: "prospect",
    occurrenceKey: `booking_confirmation:${params.scheduledAppointmentAtIso}`,
    scheduledAppointmentAtIso: params.scheduledAppointmentAtIso,
    toPhoneRaw: params.prospectPhone,
    consentGiven: params.prospectConsent,
    message: buildAppointmentConfirmationSms({ businessName: params.businessName, dateLabel, timeLabel }),
    dryRun: false,
  });
}

// ---------------------------------------------------------------------
// Composite entry point - one call per (appointment, reminder_type)
// claims and sends BOTH the prospect-facing reminder (consent-gated) and
// the internal admin notification (never consent-gated), each through
// its own independent claim above, and returns both outcomes so the
// calling job can fold them into its summary. This is the one function
// both leadgen-appointment-reminders.ts and winsalot-consultation-
// reminders.ts call - identical work either way, only the table name,
// CRM label, and how the appointment's own fields are read differ,
// which is why those stay in each CRM's own job file rather than here.
// ---------------------------------------------------------------------
export type AppointmentSmsPairResult = {
  prospect: { outcome: SmsOutcome; error?: string; recipientPhone?: string | null };
  admin: { outcome: SmsOutcome; error?: string; recipientPhone?: string | null };
};

export async function sendAppointmentReminderSmsPair(
  admin: SupabaseClient,
  params: {
    table: SmsReminderTable;
    appointmentId: string;
    leadId?: string | null;
    reminderType: SmsReminderType;
    occurrenceKey: string;
    scheduledMs: number;
    scheduledAppointmentAtIso: string;
    timezone: string;
    prospectPhone: string | null;
    prospectConsent: boolean;
    businessName: string;
    contactName: string | null;
    crmLabel: "Growth" | "Lead Gen";
    dryRun: boolean;
  }
): Promise<AppointmentSmsPairResult> {
  const nowMs = Date.now();
  const isToday = isAppointmentToday(params.scheduledMs, params.timezone, nowMs);
  const timeLabel = formatSmsTimeLabel(params.scheduledMs, params.timezone);

  const prospectMessage = buildProspectReminderSms({ businessName: params.businessName, reminderType: params.reminderType, timeLabel });
  const adminMessage = buildAdminReminderSms({
    crmLabel: params.crmLabel,
    businessName: params.businessName,
    contactName: params.contactName,
    isToday,
    timeLabel,
  });

  const shared = {
    table: params.table,
    appointmentId: params.appointmentId,
    leadId: params.leadId,
    reminderType: params.reminderType,
    occurrenceKey: params.occurrenceKey,
    scheduledAppointmentAtIso: params.scheduledAppointmentAtIso,
    dryRun: params.dryRun,
  };

  const prospect = await claimAndSendAppointmentSms(admin, {
    ...shared,
    recipientType: "prospect",
    toPhoneRaw: params.prospectPhone,
    consentGiven: params.prospectConsent,
    message: prospectMessage,
  });

  const adminResult = await claimAndSendAppointmentSms(admin, {
    ...shared,
    recipientType: "admin",
    toPhoneRaw: process.env.ADMIN_PHONE_NUMBER ?? null,
    consentGiven: true,
    message: adminMessage,
  });

  return { prospect, admin: adminResult };
}
