import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyOfNewLeadgenAppointment } from "@/lib/leadgen-appointment-notifications";
import { LEADGEN_LEAD_CLOSED_STATUSES, type LeadgenAppointmentRow, type LeadgenClientRow, type LeadgenLeadStatus, type LeadgenMeetingType } from "@/lib/leadgen-types";
import { isValidMobileNumber, sendImmediateAppointmentConfirmation } from "@/lib/appointment-sms";

export const runtime = "nodejs";

// Receives Calendly's webhook events (Calendly dashboard -> Integrations
// -> Webhooks, or the Webhook Subscriptions API - see docs/crm.md) for
// the "invitee.created"/"invitee.canceled" events, so a booking made on
// Calendly (the consultation emails' booking button opens Calendly
// directly per the brief - "Do not create a separate internal booking
// page") still lands in leadgen_appointments exactly like a
// staff-booked one: visible to admin/agents immediately, with the same
// admin email+SMS notification (src/lib/leadgen-appointment-notifications.ts)
// used everywhere else in this CRM.
//
// This route is intentionally outside src/proxy.ts's matcher - Calendly
// calls it directly with no Supabase session, so it authenticates the
// request itself via the webhook signature instead (same pattern as
// /api/webhooks/resend).

type CalendlyQuestionAnswer = { question?: string; answer?: string };
type CalendlyLocation = { type?: string; join_url?: string; location?: string } | null;
type CalendlyScheduledEvent = {
  start_time?: string;
  event_type?: string;
  location?: CalendlyLocation;
};
type CalendlyInviteePayload = {
  uri: string;
  name?: string;
  email?: string;
  timezone?: string;
  text_reminder_number?: string;
  questions_and_answers?: CalendlyQuestionAnswer[];
  scheduled_event?: CalendlyScheduledEvent;
};
type CalendlyWebhookEvent = {
  event: string;
  payload: CalendlyInviteePayload;
};

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

// Calendly signing scheme: header "Calendly-Webhook-Signature:
// t=<unix seconds>,v1=<hex hmac-sha256>", computed over `${t}.${rawBody}`
// with the signing key shown once when the webhook subscription is
// created. https://developer.calendly.com/api-docs/webhook-signatures
function verifyCalendlySignature(rawBody: string, header: string | null, signingKey: string): boolean {
  if (!header) return false;

  const fields = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    })
  );
  const timestamp = fields.t;
  const providedSignature = fields.v1;
  if (!timestamp || !providedSignature) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expectedSignature = createHmac("sha256", signingKey).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const providedBuffer = Buffer.from(providedSignature, "hex");
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

// Converts Calendly's UTC start_time into the invitee's local wall-clock
// date/time, matching how leadgen_appointments already stores every
// other appointment (separate date/time/timezone columns - see
// supabase/migrations/0031_leadgen_crm.sql) rather than a single
// timestamptz.
function formatInTimeZone(isoUtc: string, timeZone: string): { date: string; time: string } {
  const instant = new Date(isoUtc);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// Calendly's default invitee payload has no dedicated "business name"
// field - best-effort pull it from a custom question if the Calendly
// event type asks one (matching "business"/"company" in the question
// text), otherwise fall back to the invitee's own name so the
// appointment always has a usable label.
function extractBusinessName(invitee: CalendlyInviteePayload): string {
  const match = (invitee.questions_and_answers ?? []).find((qa) => /business|company/i.test(qa.question ?? ""));
  return match?.answer?.trim() || invitee.name || "Calendly booking";
}

export async function POST(request: NextRequest) {
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.error(
      "[calendly-webhook] CALENDLY_WEBHOOK_SIGNING_KEY is not set on this deployment - " +
        "set it to the signing key shown when the Calendly webhook subscription was created, " +
        "for the Preview environment as well as Production, then redeploy. Rejecting request."
    );
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("calendly-webhook-signature");

  if (!verifyCalendlySignature(rawBody, signatureHeader, signingKey)) {
    console.error("[calendly-webhook] Signature verification failed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: CalendlyWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const invitee = event.payload;
  if (!invitee?.uri) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const admin = getSupabaseAdmin();

  console.log(`[calendly-webhook] received ${event.event} for invitee ${invitee.uri}`);

  if (event.event === "invitee.canceled") {
    const { error } = await admin
      .from("leadgen_appointments")
      .update({ status: "Cancelled", updated_at: new Date().toISOString() })
      .eq("calendly_invitee_uri", invitee.uri);
    if (error) console.error(`[calendly-webhook] Failed to mark invitee ${invitee.uri} cancelled:`, error);
    return NextResponse.json({ received: true });
  }

  if (event.event !== "invitee.created") {
    return NextResponse.json({ received: true, ignored: true });
  }

  // Idempotency: a redelivered webhook (Calendly retries on a non-2xx,
  // and can also send this event more than once for the same booking)
  // matches the same invitee URI - never insert, or notify, twice for it.
  const { data: existing } = await admin.from("leadgen_appointments").select("id").eq("calendly_invitee_uri", invitee.uri).maybeSingle();
  if (existing) {
    console.log(`[calendly-webhook] duplicate delivery for invitee ${invitee.uri}, skipping.`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  const scheduledEvent = invitee.scheduled_event;
  const eventTypeUri = scheduledEvent?.event_type;

  // Match to a leadgen_clients row by its configured Calendly event type
  // URI first (Client Profile -> "Calendly Event Type URI"); with only
  // one Calendly-linked client configured, fall back to that one so this
  // works out of the box before every client has that field set.
  let client: LeadgenClientRow | null = null;
  if (eventTypeUri) {
    const { data } = await admin.from("leadgen_clients").select("*").eq("calendly_event_type_uri", eventTypeUri).maybeSingle();
    client = (data as LeadgenClientRow | null) ?? null;
  }
  if (!client) {
    const { data: candidates } = await admin.from("leadgen_clients").select("*").eq("active", true).ilike("booking_link", "%calendly.com%");
    if (candidates && candidates.length === 1) {
      client = candidates[0] as LeadgenClientRow;
    }
  }

  if (!client) {
    console.error(
      `[calendly-webhook] Could not match invitee ${invitee.uri} to a client (event_type ${eventTypeUri ?? "unknown"}) - ` +
        "set that client's Calendly Event Type URI in its Client Profile so future bookings match unambiguously. Skipping."
    );
    return NextResponse.json({ received: true, matched: false });
  }

  const timezone = invitee.timezone || "America/Toronto";
  const startTime = scheduledEvent?.start_time;
  if (!startTime) {
    console.error(`[calendly-webhook] Missing scheduled_event.start_time for invitee ${invitee.uri} - skipping.`);
    return NextResponse.json({ received: true, matched: true, error: "missing_start_time" });
  }
  const { date, time } = formatInTimeZone(startTime, timezone);

  const joinUrl = scheduledEvent?.location?.join_url ?? null;
  const meetingType: LeadgenMeetingType = joinUrl ? "Video Call" : "Phone Call";

  // Best-effort match back to an existing lead for this client by email,
  // so a self-serve booking (via the consultation email's booking link)
  // still advances that lead's status the same way a staff-booked
  // appointment does. Picks the most recently created open (not already
  // closed-out) lead with a matching email; no match just leaves the
  // appointment lead-less, same as before.
  let matchedLeadId: string | null = null;
  if (invitee.email) {
    const { data: leadCandidates } = await admin
      .from("leadgen_leads")
      .select("id, status")
      .eq("client_id", client.id)
      .ilike("email", invitee.email.trim())
      .order("created_at", { ascending: false });
    const matchedLead = (leadCandidates ?? []).find(
      (lead) => !LEADGEN_LEAD_CLOSED_STATUSES.includes(lead.status as LeadgenLeadStatus)
    );
    matchedLeadId = matchedLead?.id ?? null;
  }

  const { data: appointment, error: insertError } = await admin
    .from("leadgen_appointments")
    .insert({
      lead_id: matchedLeadId,
      client_id: client.id,
      campaign_id: null,
      business_name: extractBusinessName(invitee),
      contact_name: invitee.name ?? null,
      phone: invitee.text_reminder_number ?? null,
      email: invitee.email ?? null,
      sms_consent: isValidMobileNumber(invitee.text_reminder_number),
      appointment_date: date,
      appointment_time: time,
      timezone,
      meeting_type: meetingType,
      meeting_link: joinUrl,
      status: "Booked",
      created_by: null,
      calendly_invitee_uri: invitee.uri,
    })
    .select("*")
    .single();

  if (insertError || !appointment) {
    console.error(`[calendly-webhook] Failed to save appointment for invitee ${invitee.uri}:`, insertError);
    return NextResponse.json({ received: true, error: "save_failed" });
  }

  console.log(`[calendly-webhook] saved appointment ${appointment.id} for client ${client.name} (invitee ${invitee.uri})`);

  if (matchedLeadId) {
    await admin
      .from("leadgen_leads")
      .update({ status: "Appointment booked", last_contacted_at: new Date().toISOString() })
      .eq("id", matchedLeadId);
    await admin.from("leadgen_lead_activities").insert({
      lead_id: matchedLeadId,
      agent_id: null,
      activity_type: "appointment_booked",
      call_outcome: "Appointment booked",
      notes: `Appointment self-booked via booking link for ${date} ${time} (${timezone}).`,
    });
  }

  await sendImmediateAppointmentConfirmation(admin, {
    table: "leadgen_appointment_sms_reminders",
    appointmentId: appointment.id as string,
    leadId: matchedLeadId,
    scheduledAppointmentAtIso: startTime,
    timezone,
    prospectPhone: invitee.text_reminder_number ?? null,
    prospectConsent: isValidMobileNumber(invitee.text_reminder_number),
    businessName: client.name,
  });

  await notifyOfNewLeadgenAppointment(appointment as LeadgenAppointmentRow, client, null);

  return NextResponse.json({ received: true, appointmentId: appointment.id });
}
