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

// Hardens against accidental env formatting issues (leading/trailing
// whitespace/newlines or quoted value pasted from a UI/CLI export).
function normalizeWebhookSecret(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/^['"]|['"]$/g, "");
  return trimmed ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  // This one route.ts is deployed to both the Winsalot Growth CRM
  // (growth.winsalotcorp.com, formerly cleaning.winsalotcorp.com) and the
  // Lead Gen CRM (leads.winsalotcorp.com) Vercel projects, and each has
  // its own webhook registered in Resend with its own distinct signing
  // secret - so both env vars need to be checked here, not just one.
  // RESEND_WEBHOOK_SECRET is the Growth CRM's secret (see docs/crm.md's
  // webhook setup instructions); RESEND_LEADGEN_WEBHOOK_SECRET is the
  // Lead Gen CRM's.
  const leadgenWebhookSecret = normalizeWebhookSecret(process.env.RESEND_LEADGEN_WEBHOOK_SECRET);
  const cleaningWebhookSecret = normalizeWebhookSecret(process.env.RESEND_WEBHOOK_SECRET);
  const candidateSecrets = [leadgenWebhookSecret, cleaningWebhookSecret].filter((secret): secret is string => !!secret);

  if (candidateSecrets.length === 0) {
    // Vercel scopes env vars per environment (Production/Preview/Development
    // independently) and only injects the current value into *new*
    // deployments - adding or fixing the var in Project Settings never
    // updates an already-running deployment, so this can still fire after
    // the var has been "set" if it was scoped to the wrong environment or
    // no redeploy happened since. process.env is read fresh on every
    // request (this route runs on the Node.js runtime, not Edge), so once
    // a deployment actually has the var, no further redeploy is needed.
    console.error(
      "[resend-webhook] Neither RESEND_LEADGEN_WEBHOOK_SECRET nor RESEND_WEBHOOK_SECRET is set on this deployment - " +
        "check the vars are defined for the environment handling this webhook (not just Production) " +
        "in Vercel Project Settings -> Environment Variables, then redeploy. Rejecting request."
    );
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
  let verifiedWith: "leadgen" | "cleaning" | null = null;
  for (const secret of candidateSecrets) {
    try {
      event = getResendClient().webhooks.verify({
        payload,
        headers: { id, timestamp, signature },
        webhookSecret: secret,
      });
      verifiedWith = secret === leadgenWebhookSecret ? "leadgen" : "cleaning";
      break;
    } catch {
      // Try the next configured webhook secret.
    }
  }

  if (!event) {
    // Include the webhook id so a signature failure can be correlated
    // against a specific delivery in Resend's dashboard (Webhooks -> the
    // endpoint pointed at this URL -> Recent deliveries). This error means
    // none of the configured webhook secrets matched this payload.
    // Each registered endpoint has its own distinct secret, so the fix is
    // to copy the Signing Secret from the exact endpoint whose URL matches
    // this deployment and set it as the corresponding env var here. It is
    // never a bug in the verification code itself.
    console.error(`[resend-webhook] Signature verification failed for webhook id ${id}.`);
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  console.log(`[resend-webhook] received ${event.type} (webhook id ${id}, verified with ${verifiedWith ?? "unknown"} secret)`);

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
  // 2xx) reuses the same webhook id, and the same webhook id can also
  // legitimately reach this route more than once if more than one
  // endpoint is registered for these events (Resend/Svix sends every
  // registered endpoint the same webhook id for one underlying event).
  // Recording it once here is used only to skip logging a duplicate
  // crm_activities/leadgen_lead_activities note below - it must NOT skip
  // the status update itself. The status write (below) only ever sets
  // columns to the values this exact event carries, so re-applying it -
  // whether from a genuine retry or from a second registered endpoint
  // racing this one for the same id - is a harmless no-op, and skipping
  // it here would leave the row stuck on whatever status it already had
  // any time this handler loses that race.
  const { error: dedupeError } = await admin.from("crm_email_webhook_events").insert({ id });
  const isDuplicateDelivery = !!dedupeError;
  if (isDuplicateDelivery) {
    console.log(`[resend-webhook] webhook id ${id} already recorded (retry or a second registered endpoint) - applying the status update but skipping the activity note.`);
  }

  const emailId = event.data.email_id;
  const eventAt = event.created_at ?? new Date().toISOString();

  // Invoice-send/reminder tracking (crm_invoice_emails, migration 0091) is
  // checked first, before falling into the crm_lead_emails/leadgen_emails
  // branches below - a completely independent tracked-email table, same
  // "no RLS policies, service-role only" convention as crm_lead_emails.
  const { data: trackedInvoiceEmail } = await admin
    .from("crm_invoice_emails")
    .select("id, invoice_id, status_at")
    .eq("resend_email_id", emailId)
    .maybeSingle();

  if (trackedInvoiceEmail) {
    console.log(`[resend-webhook] matched email ${emailId} to crm_invoice_emails ${trackedInvoiceEmail.id} (invoice ${trackedInvoiceEmail.invoice_id})`);

    // crm_invoice_emails' status check constraint (migration 0094) now
    // covers every status crm_lead_emails does, including 'failed'/
    // failed_at - "track delivered, bounced and failed statuses through
    // the Resend webhook."
    const isNewer = new Date(eventAt) >= new Date(trackedInvoiceEmail.status_at);
    const invoiceEmailUpdates: Record<string, unknown> = { [STATUS_COLUMN[status]]: eventAt };
    if (isNewer) {
      invoiceEmailUpdates.status = status;
      invoiceEmailUpdates.status_at = eventAt;
    }

    const { error: invoiceEmailUpdateError } = await admin
      .from("crm_invoice_emails")
      .update(invoiceEmailUpdates)
      .eq("id", trackedInvoiceEmail.id);
    if (invoiceEmailUpdateError) {
      console.error(`[resend-webhook] failed to update crm_invoice_emails ${trackedInvoiceEmail.id}:`, invoiceEmailUpdateError);
    }

    if (!isDuplicateDelivery && trackedInvoiceEmail.invoice_id) {
      const toEmail = Array.isArray(event.data.to) ? event.data.to.join(", ") : String(event.data.to);
      let notes = `Invoice email ${status} (to ${toEmail}).`;
      if (event.type === "email.bounced") notes = `Invoice email bounced (to ${toEmail}) - verify or correct this client's email address.`;
      else if (event.type === "email.complained") notes = `Recipient marked an invoice email as spam (to ${toEmail}).`;
      else if (event.type === "email.opened") notes = `Client opened the invoice email (to ${toEmail}).`;
      else if (event.type === "email.clicked") notes = `Client clicked a link in the invoice email (to ${toEmail}).`;
      else if (event.type === "email.failed") notes = `Invoice email failed to send (to ${toEmail}).`;

      const { data: invoiceRow } = await admin.from("crm_invoices").select("client_id").eq("id", trackedInvoiceEmail.invoice_id).maybeSingle();
      await admin.from("crm_activities").insert({
        client_id: invoiceRow?.client_id ?? null,
        invoice_id: trackedInvoiceEmail.invoice_id,
        agent_id: null,
        activity_type: "note",
        notes,
        occurred_at: eventAt,
      });
    }

    return NextResponse.json({ received: true, tracked: true });
  }

  const { data: tracked } = await admin
    .from("crm_lead_emails")
    .select("id, lead_id, opportunity_id, provider_lead_id, status_at")
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

    if (leadgenEmail.lead_id && !isDuplicateDelivery) {
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
      (tracked.opportunity_id
        ? `(opportunity ${tracked.opportunity_id})`
        : tracked.lead_id
          ? `(lead ${tracked.lead_id})`
          : `(provider lead ${tracked.provider_lead_id})`)
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

  // Only mirror onto the target record (a crm_opportunities opportunity, a
  // historical crm_leads lead, or a provider_leads provider) if this row
  // is its most recently sent tracked email — an older email's
  // late-arriving webhook should never overwrite what a newer email
  // already reported. Exactly one of opportunity_id/lead_id/
  // provider_lead_id is ever set on a crm_lead_emails row (see migrations
  // 0026/0085), so this branches once and reuses the same isNewer/eventAt
  // logic for whichever target applies.
  const targetTable = tracked.opportunity_id ? "crm_opportunities" : tracked.lead_id ? "crm_leads" : "provider_leads";
  const targetColumn = tracked.opportunity_id ? "opportunity_id" : tracked.lead_id ? "lead_id" : "provider_lead_id";
  const targetId = tracked.opportunity_id ?? tracked.lead_id ?? tracked.provider_lead_id;

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
  const recordLabel = tracked.opportunity_id ? "opportunity" : tracked.lead_id ? "lead" : "provider";
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

  if (!isDuplicateDelivery) {
    const { error: activityError } = await admin.from("crm_activities").insert({
      lead_id: tracked.lead_id,
      opportunity_id: tracked.opportunity_id,
      provider_lead_id: tracked.provider_lead_id,
      agent_id: null,
      activity_type: "email",
      notes,
      occurred_at: eventAt,
    });
    if (activityError) {
      console.error(`[resend-webhook] failed to log activity for ${targetTable} ${targetId}:`, activityError);
    }
  }

  return NextResponse.json({ received: true });
}
