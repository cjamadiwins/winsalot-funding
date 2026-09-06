import { NextRequest, NextResponse } from "next/server";
import { runCrmRetentionCadenceJob, runCrmRetentionFollowupsJob } from "@/lib/crm-retention-job";
import { sweepRetentionFollowupNotifications } from "@/lib/crm-retention-notifications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isGrowthCrmHost } from "@/lib/hosts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same hardening as /api/cron/crm-weekly-marketing (existing precedent) -
// this is an entirely separate cron worker/secret check from that route,
// per the brief's "Existing Email Marketing cron functionality remains
// separate."
function normalizeCronSecret(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/^['"]|['"]$/g, "");
  return trimmed ? trimmed : undefined;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = normalizeCronSecret(process.env.CRON_SECRET);
  if (!secret) {
    console.error("[cron:crm-retention] CRON_SECRET is not set on this deployment - due retention emails cannot be processed. Rejecting request.");
    return false;
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    console.error("[cron:crm-retention] Authorization header did not match the configured CRON_SECRET - rejecting request.");
    return false;
  }
  return true;
}

function isEnabledOnThisProject(request: NextRequest): boolean {
  const override = process.env.CRM_RETENTION_CRON_ENABLED;
  if (override === "true") return true;
  if (override === "false") return false;
  return isGrowthCrmHost(request.nextUrl.hostname);
}

export async function GET(request: NextRequest) {
  // Same "only the Growth CRM project may run this worker" duplicate-send
  // guard as /api/cron/crm-weekly-marketing - this codebase is deployed to
  // both the Growth CRM and Lead Gen CRM Vercel projects.
  if (!isEnabledOnThisProject(request)) {
    return NextResponse.json({ skipped: true, reason: "This is not the Growth CRM project." });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
    const [cadence, followups] = await Promise.all([runCrmRetentionCadenceJob({ dryRun }), runCrmRetentionFollowupsJob({ dryRun })]);
    if (!dryRun) await sweepRetentionFollowupNotifications(getSupabaseAdmin());
    return NextResponse.json({ cadence, followups });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown retention job error." }, { status: 500 });
  }
}
