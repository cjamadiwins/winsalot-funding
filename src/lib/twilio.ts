import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Sends SMS via the Twilio REST API directly with fetch, so the project
// doesn't need the full twilio SDK as a dependency for a single API call.
// Docs: https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource

// Twilio request-signature validation (used by both webhook routes -
// src/app/api/webhooks/twilio/status/route.ts and
// .../twilio/inbound/route.ts) implemented directly per Twilio's
// documented algorithm, same "no SDK dependency" approach as the sender
// above: https://www.twilio.com/docs/usage/webhooks/webhooks-security
//
// Algorithm: take the exact URL Twilio was configured to POST to,
// append every POST-body param's key+value (no separator) in
// alphabetically-sorted-by-key order, HMAC-SHA1 the result with the
// Auth Token, base64-encode it, and compare to the X-Twilio-Signature
// header. `url` must match byte-for-byte what's configured in the
// Twilio console (scheme + host + path + query string, no trailing
// slash difference) - see each route's own comment for how it's
// reconstructed from the incoming request.
export function verifyTwilioSignature(url: string, params: Record<string, string>, signatureHeader: string | null): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signatureHeader) return false;

  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function toE164(rawNumber: string): string {
  const digitsOnly = rawNumber.replace(/[^\d+]/g, "");
  if (digitsOnly.startsWith("+")) return digitsOnly;
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;
  return `+${digitsOnly}`;
}

export type TwilioSendResult = { sid: string; status: string };

// Shared low-level sender - the internal admin notification (sendSms),
// the Provider Profile's outbound "Send SMS" quick action
// (sendSmsToNumber), and the appointment-reminder system's tracked send
// (sendTrackedSmsToNumber, below) all go through this. Returns the
// Twilio message resource's sid/status rather than void, so a caller
// that needs to persist the sid (for the delivery-status webhook to find
// later) or the immediate queued/failed status can - sendSms/
// sendSmsToNumber simply discard it, keeping their existing void
// signature and behavior exactly as before.
async function postSms(toNumberRaw: string, body: string): Promise<TwilioSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !authToken && "TWILIO_AUTH_TOKEN",
      !fromNumber && "TWILIO_PHONE_NUMBER",
    ].filter(Boolean);
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}.`);
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const statusCallbackUrl = smsStatusCallbackUrl();
  const params = new URLSearchParams({
    To: toE164(toNumberRaw),
    From: toE164(fromNumber),
    Body: body,
    ...(statusCallbackUrl ? { StatusCallback: statusCallbackUrl } : {}),
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  const payload = (await response.json().catch(() => null)) as { sid?: string; status?: string } | null;

  if (!response.ok) {
    // Twilio error bodies can include account details; don't log the raw body.
    throw new Error(`Twilio API responded with status ${response.status}.`);
  }
  if (!payload?.sid) {
    throw new Error("Twilio API response did not include a message sid.");
  }

  return { sid: payload.sid, status: payload.status ?? "queued" };
}

// Best-effort absolute URL for the Twilio delivery-status webhook (see
// src/app/api/webhooks/twilio/status/route.ts) - set only when this
// deployment's own site URL is known, so a local/preview deployment
// without NEXT_PUBLIC_SITE_URL configured still sends SMS successfully,
// just without delivery-status callbacks (the reminder stays "Sent"
// rather than ever reaching "Delivered"/"Failed" from Twilio's side).
function smsStatusCallbackUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return null;
  try {
    return new URL("/api/webhooks/twilio/status", base).toString();
  } catch {
    return null;
  }
}

export async function sendSms(body: string): Promise<void> {
  const toNumberRaw = process.env.SMS_NOTIFICATION_NUMBER;
  if (!toNumberRaw) {
    throw new Error("Missing environment variable(s): SMS_NOTIFICATION_NUMBER.");
  }
  await postSms(toNumberRaw, body);
}

// Sends to an arbitrary number (e.g. a provider's own phone), unlike
// sendSms() above which always targets the fixed internal
// SMS_NOTIFICATION_NUMBER. Used by the Provider Profile's "Send SMS"
// quick action - the existing internal notification path is untouched.
export async function sendSmsToNumber(toNumber: string, body: string): Promise<void> {
  await postSms(toNumber, body);
}

// Tracked send for the appointment-reminder system (src/lib/appointment-sms.ts):
// returns the Twilio message sid/status instead of discarding them, so the
// caller can persist the sid on its reminder row for the delivery-status
// webhook to update later, and record Twilio's own immediate status
// (queued/failed) rather than assuming success just because the HTTP
// request was accepted.
export async function sendTrackedSmsToNumber(toNumber: string, body: string): Promise<TwilioSendResult> {
  return postSms(toNumber, body);
}
