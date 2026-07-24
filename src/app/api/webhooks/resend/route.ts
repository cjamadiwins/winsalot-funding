import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { EMAIL_STATUS_LABELS, type EmailEventStatus } from "@/lib/crm-types";

export const runtime = "nodejs";

// Receives Resend's delivery-event webhooks (configured in the Resend
// dashboard → Webhooks, see docs/crm.md for the exact setup) and updates
// whichever crm_lead_emails row that email belongs to. Only emails sent
// through sendTrackedCrmEmail (the CRM's "Send Quote Request Email"/"Send
// Follow-Up Email" actions) are tracked there — every other Resend email
// this app sends (opportunity alerts, backup notifications, agent
// invites) has no matching row and is silently ignored below.
//
// This route is intentionally outside src/proxy.ts's matcher
// (["/", "/admin/:path*", "/agent/:path*"]) — Resend calls it directly
// with no Supabase session, so it authenticates the request itself via
// the webhook signature instead.
//
// Every branch below logs to console so a delivery can be traced in
// Vercel's runtime logs (Project → Logs, or the Vercel MCP
// get_runtime_logs tool) - useful for confirming Resend is actually
// calling this endpoint at all, which is the first thing to check if a
// lead's status isn't updating (a delivery that never reaches this route
// produces zero log lines here and needs to be fixed in the Resend
// dashboard's Webhooks config, not in this code).
const STATUS_COLUMN: Record<EmailEventStatus, string> = {
  sent: "sent_at",
  delivered: "delivered_at",
  delayed: "delayed_at",
  bounced: "bounced_at",
  complained: "complained_at",
  opened: "opened_at",
  clicked: "clicked_at",
  failed: "failed_at",
};

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Vercel scopes env vars per environment (Production/Preview/Development
    // independently) and only injects the current value into *new*
    // deployments - adding or fixing the var in Project Settings never
    // updates an already-running deployment, so this can still fire after
    // the var has been "set" if it was scoped to the wrong environment or
    // no redeploy happened since. process.env is read fresh on every
    // request (this route runs on the Node.js runtime, not Edge), so once
    // a deployment actually has the var, no further redeploy is needed.
    console.error(
      "[resend-webhook] RESEND_WEBHOOK_SECRET is not set on this deployment - " +
        "check it's defined for the Preview environment (not just Production) " +
        "in Vercel Project Settings -> Environment Variables, then redeploy. Rejecting request."
    );
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const payload = await request.text();
  const id = request.headers.get("webhook-id") ?? request.headers.get("svix-id");
  const timestamp = request.headers.get("webhook-timestamp") ?? request.headers.get("svix-timestamp");
  const signature = request.headers.get("webhook-signature") ?? request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    console.error("[resend-webhook] Missing signature headers on incoming request.");
    return NextResponse.json({ error: "Missing webhook signature headers." }, { status: 400 });
  }

  let event;
  try {
    event = getResendClient().webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch (err) {
    console.error("[resend-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  console.log(`[resend-webhook] received ${event.type} (webhook id ${id})`);

  let status: EmailEventStatus;
  switch (event.type) {
    case "email.sent":
      status = "sent";
      break;
    case "email.delivered":
      status = "delivered";
      break;
    case "email.delivery_delayed":
      status = "delayed";
      break;
    case "email.bounced":
      status = "bounced";
      break;
    case "email.complained":
      status = "complained";
      break;
    // "opened" and "clicked" are only ever set by their own event here -
    // never inferred from "delivered" or any other event, so a delivered
    // email is never mistakenly shown as read.
    case "email.opened":
      status = "opened";
      break;
    case "email.clicked":
      status = "clicked";
      break;
    case "email.failed":
      status = "failed";
      break;
    default:
      // Not a delivery event we track (e.g. contact.*, domain.*, email.received).
      console.log(`[resend-webhook] ignoring untracked event type ${event.type}`);
      return NextResponse.json({ received: true });
  }

  const admin = getSupabaseAdmin();

  // Idempotency: a redelivered webhook (Resend retries until it gets a
  // 2xx) reuses the same webhook id. Recording it once and bailing out on
  // a duplicate means a retry never double-logs the same event.
  const { error: dedupeError } = await admin.from("crm_email_webhook_events").insert({ id });
  if (dedupeError) {
    console.log(`[resend-webhook] duplicate delivery of webhook id ${id}, skipping.`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  const emailId = event.data.email_id;
  const eventAt = event.created_at ?? new Date().toISOString();

  const { data: tracked } = await admin
    .from("crm_lead_emails")
    .select("id, lead_id, status_at")
    .eq("resend_email_id", emailId)
    .maybeSingle();

  if (!tracked) {
    console.log(`[resend-webhook] no crm_lead_emails row matches Resend email id ${emailId} — ignoring.`);
    return NextResponse.json({ received: true, tracked: false });
  }

  console.log(`[resend-webhook] matched email ${emailId} to crm_lead_emails ${tracked.id} (lead ${tracked.lead_id})`);

  // Only advance the row's "latest status" if this event isn't older than
  // what's already recorded — guards against an out-of-order retry (e.g.
  // a delayed "delivered" webhook arriving after "opened" already
  // processed) regressing the displayed status backwards.
  const isNewer = new Date(eventAt) >= new Date(tracked.status_at);

  const updates: Record<string, unknown> = { [STATUS_COLUMN[status]]: eventAt };
  if (isNewer) {
    updates.status = status;
    updates.status_at = eventAt;
  }

  const { error: updateError } = await admin.from("crm_lead_emails").update(updates).eq("id", tracked.id);
  if (updateError) {
    console.error(`[resend-webhook] failed to update crm_lead_emails ${tracked.id}:`, updateError);
  }

  // Only mirror onto crm_leads if this row is that lead's most recently
  // sent tracked email — an older email's late-arriving webhook should
  // never overwrite what a newer email already reported for the lead.
  const { data: latestForLead } = await admin
    .from("crm_lead_emails")
    .select("id")
    .eq("lead_id", tracked.lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isNewer && latestForLead?.id === tracked.id) {
    const { error: leadUpdateError } = await admin
      .from("crm_leads")
      .update({ last_email_status: status, last_email_status_at: eventAt })
      .eq("id", tracked.lead_id);
    if (leadUpdateError) {
      console.error(`[resend-webhook] failed to update crm_leads ${tracked.lead_id}:`, leadUpdateError);
    } else {
      console.log(`[resend-webhook] lead ${tracked.lead_id} last_email_status -> ${status}`);
    }
  }

  const toEmail = Array.isArray(event.data.to) ? event.data.to.join(", ") : String(event.data.to);
  let notes = `Email ${EMAIL_STATUS_LABELS[status].toLowerCase()} (to ${toEmail}) — "${event.data.subject}".`;
  if (event.type === "email.bounced") {
    notes = `Email bounced (to ${toEmail}) — ${event.data.bounce.message}. Verify or correct this lead's email address.`;
  } else if (event.type === "email.complained") {
    notes = `Recipient marked this email as spam (to ${toEmail}). Consider not emailing this lead again.`;
  } else if (event.type === "email.clicked") {
    notes = `Client clicked the link in the email (to ${toEmail}).`;
  } else if (event.type === "email.opened") {
    notes = `Client opened the email (to ${toEmail}).`;
  } else if (event.type === "email.failed") {
    notes = `Email failed to send (to ${toEmail}) — ${event.data.failed.reason}.`;
  }

  const { error: activityError } = await admin.from("crm_activities").insert({
    lead_id: tracked.lead_id,
    agent_id: null,
    activity_type: "email",
    notes,
    occurred_at: eventAt,
  });
  if (activityError) {
    console.error(`[resend-webhook] failed to log activity for lead ${tracked.lead_id}:`, activityError);
  }

  return NextResponse.json({ received: true });
}
