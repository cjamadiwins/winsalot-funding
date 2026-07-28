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
  const rawLeadgenWebhookSecret = process.env.RESEND_LEADGEN_WEBHOOK_SECRET;
  if (!rawLeadgenWebhookSecret) {
    // Vercel scopes env vars per environment (Production/Preview/Development
    // independently) and only injects the current value into *new*
    // deployments - adding or fixing the var in Project Settings never
    // updates an already-running deployment, so this can still fire after
    // the var has been "set" if it was scoped to the wrong environment or
    // no redeploy happened since. process.env is read fresh on every
    // request (this route runs on the Node.js runtime, not Edge), so once
    // a deployment actually has the var, no further redeploy is needed.
    console.error(
      "[resend-webhook] RESEND_LEADGEN_WEBHOOK_SECRET is not set on this deployment - " +
        "check the var is defined for the environment handling this webhook (not just Production) " +
        "in Vercel Project Settings -> Environment Variables, then redeploy. Rejecting request."
    );
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  // Hardens against accidental env formatting issues (leading/trailing
  // whitespace/newlines or quoted value pasted from a UI/CLI export).
  const leadgenWebhookSecret = rawLeadgenWebhookSecret.trim().replace(/^['"]|['"]$/g, "");
  if (!leadgenWebhookSecret) {
    console.error("[resend-webhook] RESEND_LEADGEN_WEBHOOK_SECRET resolved to an empty value after normalization.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const payload = await request.text();
  const id = request.headers.get("webhook-id") ?? request.headers.get("svix-id");
  const timestamp = request.headers.get("webhook-timestamp") ?? request.headers.get("svix-timestamp");
  const signature = request.headers.get("webhook-signature") ?? request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    console.error(`[resend-webhook] Missing signature headers on incoming request. webhook id=${id ?? "none"}`);
    return NextResponse.json({ error: "Missing webhook signature headers." }, { status: 400 });
  }

  let event;
  try {
    event = getResendClient().webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: leadgenWebhookSecret,
    });
  } catch {
    // Include the webhook id so a signature failure can be correlated
    // against a specific delivery in Resend's dashboard (Webhooks -> the
    // endpoint pointed at this URL -> Recent deliveries). This error means
    // RESEND_LEADGEN_WEBHOOK_SECRET on this deployment does not match the
    // signing secret Resend used for this endpoint. The fix is to copy the
    // Signing Secret from that exact LeadGen webhook endpoint and set it as
    // RESEND_LEADGEN_WEBHOOK_SECRET.
    // Each registered endpoint has its own distinct secret, so the fix is
    // to copy the Signing Secret from the exact endpoint whose URL matches
    // this deployment and set it as the corresponding env var here. It is
    // never a bug in the verification code itself.
    console.error(`[resend-webhook] Signature verification failed for webhook id ${id}.`);
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  console.log(`[resend-webhook] received ${event.type} (webhook id ${id}, verified with leadgen secret)`);

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
    .select("id, lead_id, provider_lead_id, status_at")
    .eq("resend_email_id", emailId)
    .maybeSingle();

  if (!tracked) {
    // Not a cleaning-CRM-tracked email - check the Lead Generation CRM's
    // completely separate email log (leadgen_emails) before giving up.
    // This is the only place the two CRMs' email tracking ever touch the
    // same code path, and only ever as an independent fallback lookup -
    // neither table is ever written to based on a match in the other.
    const { data: leadgenEmail } = await admin
      .from("leadgen_emails")
      .select("id, lead_id, to_email, status")
      .eq("resend_message_id", emailId)
      .maybeSingle();

    if (!leadgenEmail) {
      console.log(`[resend-webhook] no crm_lead_emails or leadgen_emails row matches Resend email id ${emailId} — ignoring.`);
      return NextResponse.json({ received: true, tracked: false });
    }

    console.log(`[resend-webhook] matched email ${emailId} to leadgen_emails ${leadgenEmail.id}`);

    // Every event Resend can send for a tracked leadgen_emails row -
    // brief: "Do not mark an email as 'Delivered' merely because the
    // Resend send request succeeded. Only mark it delivered after
    // receiving the official email.delivered webhook" (sendLeadgenEmail
    // in lib/leadgen-email.ts only ever sets 'sent' on a successful send
    // - 'delivered' is set here, and only here).
    const leadgenUpdates: Record<string, unknown> = {};
    const leadgenEventColumnByType: Record<string, string> = {
      "email.sent": "sent_at",
      "email.delivered": "delivered_at",
      "email.delivery_delayed": "delayed_at",
      "email.bounced": "bounced_at",
      "email.complained": "complained_at",
      "email.opened": "opened_at",
      "email.clicked": "clicked_at",
      "email.failed": "failed_at",
    };

    const leadgenEventColumn = leadgenEventColumnByType[event.type];
    if (leadgenEventColumn) {
      leadgenUpdates[leadgenEventColumn] = eventAt;
    }

    switch (event.type) {
      case "email.sent":
        leadgenUpdates.status = "sent";
        break;
      case "email.delivered":
        leadgenUpdates.status = "delivered";
        break;
      case "email.delivery_delayed":
        leadgenUpdates.status = "delayed";
        break;
      case "email.bounced":
        leadgenUpdates.status = "bounced";
        leadgenUpdates.bounce_reason = event.data.bounce.message;
        break;
      case "email.complained":
        leadgenUpdates.status = "complained";
        break;
      case "email.opened":
        leadgenUpdates.status = "opened";
        break;
      case "email.clicked":
        leadgenUpdates.status = "clicked";
        break;
      case "email.failed":
        leadgenUpdates.status = "failed";
        leadgenUpdates.failure_reason = event.data.failed.reason;
        break;
      default:
        return NextResponse.json({ received: true, tracked: true, ignored: true });
    }

    const { error: leadgenUpdateError } = await admin.from("leadgen_emails").update(leadgenUpdates).eq("id", leadgenEmail.id);
    if (leadgenUpdateError) {
      console.error(`[resend-webhook] failed to update leadgen_emails ${leadgenEmail.id}:`, leadgenUpdateError);
    }

    // A hard bounce (re-)blocks this exact address from further agent
    // sends until an admin corrects or approves it - see
    // leadgen_bounced_emails and the check in sendLeadgenEmail() (lib/
    // leadgen-email.ts). cleared_at is reset to null on every fresh
    // bounce, even one an admin previously cleared: a repeat bounce means
    // whatever correction was made didn't fix it, so it needs another look.
    if (event.type === "email.bounced") {
      const { error: bounceUpsertError } = await admin.from("leadgen_bounced_emails").upsert(
        {
          email: leadgenEmail.to_email.trim().toLowerCase(),
          bounce_reason: event.data.bounce.message,
          bounced_at: eventAt,
          cleared_at: null,
          cleared_by: null,
        },
        { onConflict: "email" }
      );
      if (bounceUpsertError) {
        console.error(`[resend-webhook] failed to record bounced address for ${leadgenEmail.to_email}:`, bounceUpsertError);
      }
    }

    if (leadgenEmail.lead_id) {
      const toEmail = Array.isArray(event.data.to) ? event.data.to.join(", ") : String(event.data.to);
      const leadgenStatus = (leadgenUpdates.status ?? leadgenEmail.status) as string;
      let notes = `Email ${leadgenStatus} (to ${toEmail}) — "${event.data.subject}".`;
      if (event.type === "email.bounced") {
        notes = `Email bounced (to ${toEmail}) — ${event.data.bounce.message}. This address is now blocked from further agent sends until an admin corrects or approves it.`;
      } else if (event.type === "email.complained") {
        notes = `Recipient marked this email as spam (to ${toEmail}). Consider not emailing this lead again.`;
      } else if (event.type === "email.clicked") {
        notes = `Consultation link clicked (to ${toEmail}).`;
      } else if (event.type === "email.opened") {
        notes = `Email opened (to ${toEmail}).`;
      } else if (event.type === "email.failed") {
        notes = `Email failed to send (to ${toEmail}) — ${event.data.failed.reason}.`;
      }
      await admin.from("leadgen_lead_activities").insert({
        lead_id: leadgenEmail.lead_id,
        agent_id: null,
        activity_type: "email",
        notes,
        occurred_at: eventAt,
      });
    }

    return NextResponse.json({ received: true, tracked: true });
  }

  console.log(
    `[resend-webhook] matched email ${emailId} to crm_lead_emails ${tracked.id} ` +
      (tracked.lead_id ? `(lead ${tracked.lead_id})` : `(provider lead ${tracked.provider_lead_id})`)
  );

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

  // Only mirror onto the target record (a crm_leads lead or a
  // provider_leads provider) if this row is its most recently sent tracked
  // email — an older email's late-arriving webhook should never overwrite
  // what a newer email already reported. Exactly one of lead_id/
  // provider_lead_id is ever set on a crm_lead_emails row (see migration
  // 0026), so this branches once and reuses the same isNewer/eventAt logic
  // for either target.
  const targetTable = tracked.lead_id ? "crm_leads" : "provider_leads";
  const targetColumn = tracked.lead_id ? "lead_id" : "provider_lead_id";
  const targetId = tracked.lead_id ?? tracked.provider_lead_id;

  const { data: latestForTarget } = await admin
    .from("crm_lead_emails")
    .select("id")
    .eq(targetColumn, targetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isNewer && latestForTarget?.id === tracked.id) {
    const { error: targetUpdateError } = await admin
      .from(targetTable)
      .update({ last_email_status: status, last_email_status_at: eventAt })
      .eq("id", targetId);
    if (targetUpdateError) {
      console.error(`[resend-webhook] failed to update ${targetTable} ${targetId}:`, targetUpdateError);
    } else {
      console.log(`[resend-webhook] ${targetTable} ${targetId} last_email_status -> ${status}`);
    }
  }

  const toEmail = Array.isArray(event.data.to) ? event.data.to.join(", ") : String(event.data.to);
  const recordLabel = tracked.lead_id ? "lead" : "provider";
  let notes = `Email ${EMAIL_STATUS_LABELS[status].toLowerCase()} (to ${toEmail}) — "${event.data.subject}".`;
  if (event.type === "email.bounced") {
    notes = `Email bounced (to ${toEmail}) — ${event.data.bounce.message}. Verify or correct this ${recordLabel}'s email address.`;
  } else if (event.type === "email.complained") {
    notes = `Recipient marked this email as spam (to ${toEmail}). Consider not emailing this ${recordLabel} again.`;
  } else if (event.type === "email.clicked") {
    notes = `Client clicked the link in the email (to ${toEmail}).`;
  } else if (event.type === "email.opened") {
    notes = `Client opened the email (to ${toEmail}).`;
  } else if (event.type === "email.failed") {
    notes = `Email failed to send (to ${toEmail}) — ${event.data.failed.reason}.`;
  }

  const { error: activityError } = await admin.from("crm_activities").insert({
    lead_id: tracked.lead_id,
    provider_lead_id: tracked.provider_lead_id,
    agent_id: null,
    activity_type: "email",
    notes,
    occurred_at: eventAt,
  });
  if (activityError) {
    console.error(`[resend-webhook] failed to log activity for ${targetTable} ${targetId}:`, activityError);
  }

  return NextResponse.json({ received: true });
}
