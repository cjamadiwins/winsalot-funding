import { NextRequest, NextResponse } from "next/server";
import { verifyTwilioSignature, toE164 } from "@/lib/twilio";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isLeadGenHost } from "@/lib/hosts";
import { recordSmsOptIn, recordSmsOptOut, SMS_START_KEYWORDS, SMS_STOP_KEYWORDS } from "@/lib/appointment-sms";

export const runtime = "nodejs";

// Twilio's inbound-message webhook ("A MESSAGE COMES IN" on the Twilio
// phone number, Messaging tab) - must be configured by hand in the
// Twilio console for each CRM's own TWILIO_PHONE_NUMBER, since (unlike
// the delivery-status callback) there's no per-send way to set this.
// See .env.example for the exact URLs for each CRM.
//
// Records STOP/START (and Twilio's standard keyword synonyms - see
// SMS_STOP_KEYWORDS/SMS_START_KEYWORDS) into sms_opt_outs, which both
// CRMs' reminder jobs consult before every prospect-facing send (never
// the internal ADMIN_PHONE_NUMBER notification, which isn't
// consent-gated). Responds with empty TwiML rather than sending our own
// confirmation text - Twilio's own carrier-level Advanced Opt-Out
// feature (on by default on most toll-free/10DLC numbers) already
// auto-replies to STOP/START, and sending a second confirmation
// ourselves would double-text the person who just opted out.
//
// Deliberately outside src/proxy.ts's matcher - Twilio calls this
// directly with no Supabase session, authenticating itself via
// X-Twilio-Signature instead (verifyTwilioSignature, src/lib/twilio.ts).

const EMPTY_TWIML = new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
  status: 200,
  headers: { "Content-Type": "text/xml" },
});

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
    console.warn("[webhooks/twilio/inbound] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From;
  const body = (params.Body || "").trim();
  if (!from || !body) return EMPTY_TWIML;

  // Matched against the ENTIRE trimmed message body (case-insensitive),
  // never a substring - a real reply like "please stop calling me"
  // must never be misread as an opt-out.
  const keyword = body.toLowerCase();
  const admin = getSupabaseAdmin();
  const phoneE164 = toE164(from);
  const sourceCrm = isLeadGenHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "") ? "leadgen" : "growth";

  if (SMS_STOP_KEYWORDS.has(keyword)) {
    await recordSmsOptOut(admin, phoneE164, keyword, sourceCrm);
  } else if (SMS_START_KEYWORDS.has(keyword)) {
    await recordSmsOptIn(admin, phoneE164, keyword, sourceCrm);
  }
  // Any other reply is a normal conversational message, not a
  // consent-management keyword - nothing to record, no auto-reply.

  return EMPTY_TWIML;
}
