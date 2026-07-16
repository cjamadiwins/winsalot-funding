import "server-only";

// Sends SMS via the Twilio REST API directly with fetch, so the project
// doesn't need the full twilio SDK as a dependency for a single API call.
// Docs: https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource

function toE164(rawNumber: string): string {
  const digitsOnly = rawNumber.replace(/[^\d+]/g, "");
  if (digitsOnly.startsWith("+")) return digitsOnly;
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;
  return `+${digitsOnly}`;
}

export async function sendSms(body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const toNumberRaw = process.env.SMS_NOTIFICATION_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !toNumberRaw) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER or SMS_NOTIFICATION_NUMBER environment variables."
    );
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({
    To: toE164(toNumberRaw),
    From: toE164(fromNumber),
    Body: body,
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

  if (!response.ok) {
    // Twilio error bodies can include account details; don't log the raw body.
    throw new Error(`Twilio API responded with status ${response.status}.`);
  }
}
