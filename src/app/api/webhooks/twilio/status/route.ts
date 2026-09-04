import { NextRequest, NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/twilio";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// Twilio's per-message delivery-status callback. The URL Twilio calls is
// set automatically on every SMS this app sends (see
// smsStatusCallbackUrl() in src/lib/twilio.ts, which reads
// NEXT_PUBLIC_SITE_URL) - there is nothing to configure in the Twilio
// console for this one specifically, only NEXT_PUBLIC_SITE_URL on each
// Vercel project needs to be correct (see .env.example). Updates
// whichever sms reminder row (leadgen_appointment_sms_reminders or
// winsalot_appointment_sms_reminders - one shared Supabase project
// serves both CRMs, same as every other table in this app) matches the
// returned MessageSid - checked in both tables since the sid alone
// doesn't say which CRM sent it.
//
// This is the ONLY place a reminder is ever allowed to move to
// "Delivered"/"Failed" - the original send only ever marks a row "Sent"
// (the API call was accepted), never "Delivered", exactly per the
// brief's "Do not mark a reminder as delivered merely because the API
// accepted it."
//
// Deliberately outside src/proxy.ts's matcher - Twilio calls this
// directly with no Supabase session, authenticating itself via
// X-Twilio-Signature instead (verifyTwilioSignature, src/lib/twilio.ts).

type SmsTable = "leadgen_appointment_sms_reminders" | "winsalot_appointment_sms_reminders";
const SMS_TABLES: SmsTable[] = ["leadgen_appointment_sms_reminders", "winsalot_appointment_sms_reminders"];

function requestUrlForSignature(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

async function parseFormBody(request: NextRequest): Promise<Record<string, string>> {
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

export async function POST(request: NextRequest) {
  const params = await parseFormBody(request);
  const url = requestUrlForSignature(request);
  const signature = request.headers.get("x-twilio-signature");

  if (!verifyTwilioSignature(url, params, signature)) {
    console.warn("[webhooks/twilio/status] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const messageSid = params.MessageSid;
  const messageStatus = (params.MessageStatus || "").toLowerCase();
  if (!messageSid || !messageStatus) {
    return NextResponse.json({ error: "Missing MessageSid or MessageStatus" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  for (const table of SMS_TABLES) {
    const { data: row } = await admin.from(table).select("id, status").eq("twilio_message_sid", messageSid).maybeSingle();
    if (!row) continue;

    const update: Record<string, unknown> = { twilio_status: messageStatus, updated_at: nowIso };
    if (messageStatus === "delivered") {
      update.status = "delivered";
      update.delivered_at = nowIso;
    } else if (messageStatus === "failed" || messageStatus === "undelivered") {
      update.status = "failed";
      update.error_detail = params.ErrorCode ? `Twilio error ${params.ErrorCode}${params.ErrorMessage ? `: ${params.ErrorMessage}` : ""}.` : `Twilio reported "${messageStatus}".`;
    }

    await admin.from(table).update(update).eq("id", row.id);
    return NextResponse.json({ ok: true, table, reminderId: row.id, status: update.status ?? row.status });
  }

  // A sid this webhook doesn't recognize isn't an error worth 4xx-ing
  // over - Twilio retries non-2xx responses, and there's nothing to
  // retry here (the row simply doesn't exist, e.g. a stale/test send).
  console.warn(`[webhooks/twilio/status] no reminder row found for MessageSid ${messageSid}`);
  return NextResponse.json({ ok: true, matched: false });
}
