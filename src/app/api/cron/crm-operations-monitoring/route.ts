import { NextRequest, NextResponse } from "next/server";
import { runCrmOperationsMonitoringEscalations } from "@/lib/crm-monitoring-notifications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isGrowthCrmHost } from "@/lib/hosts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same hardening/shape as /api/cron/crm-retention (existing precedent) -
// reuses the same CRON_SECRET every other Vercel-scheduled cron on this
// project already checks, gated to the Growth CRM Vercel project only
// (this codebase is also deployed as the Lead Generation CRM project,
// which runs its own separate leadgen-operations-monitoring cron).
function normalizeCronSecret(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/^['"]|['"]$/g, "");
  return trimmed ? trimmed : undefined;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = normalizeCronSecret(process.env.CRON_SECRET);
  if (!secret) {
    console.error("[cron:crm-operations-monitoring] CRON_SECRET is not set on this deployment. Rejecting request.");
    return false;
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    console.error("[cron:crm-operations-monitoring] Authorization header did not match the configured CRON_SECRET - rejecting request.");
    return false;
  }
  return true;
}

function isEnabledOnThisProject(request: NextRequest): boolean {
  const override = process.env.CRM_OPERATIONS_MONITORING_CRON_ENABLED;
  if (override === "true") return true;
  if (override === "false") return false;
  return isGrowthCrmHost(request.nextUrl.hostname);
}

// Daily escalation sweep only - the Operations Monitoring dashboard card
// and detail page compute everything live on every page load, so this
// cron's only job is the "escalate serious conditions to the existing
// Admin notification system" requirement (see crm-monitoring-notifications.ts).
export async function GET(request: NextRequest) {
  if (!isEnabledOnThisProject(request)) {
    return NextResponse.json({ skipped: true, reason: "This is not the Growth CRM project." });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await runCrmOperationsMonitoringEscalations(getSupabaseAdmin());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown operations monitoring error." }, { status: 500 });
  }
}
