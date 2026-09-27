import { NextRequest, NextResponse } from "next/server";
import { runLeadgenOperationsMonitoringEscalations } from "@/lib/leadgen-monitoring-notifications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Daily Operations Monitoring escalation sweep (Lead Generation CRM) -
// same shared-route-two-projects auth pattern as
// /api/cron/leadgen-appointment-reminders: this route.ts is deployed to
// both Vercel projects from this one repo, and
// LEADGEN_OPERATIONS_MONITORING_CRON_ENABLED must be set to exactly
// "true" as a project env var on winsalot-leadgen-crm only, never on
// winsalot-funding. The dashboard card and detail page compute everything
// live on every page load and never depend on this cron having run - its
// only job is writing in-app leadgen_notifications for Action Required
// conditions (see leadgen-monitoring-notifications.ts).
export const maxDuration = 60;

function isEnabledOnThisProject(): boolean {
  return process.env.LEADGEN_OPERATIONS_MONITORING_CRON_ENABLED === "true";
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isEnabledOnThisProject()) {
    return NextResponse.json({ skipped: true, reason: "LEADGEN_OPERATIONS_MONITORING_CRON_ENABLED is not set to true on this Vercel project." });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await runLeadgenOperationsMonitoringEscalations(getSupabaseAdmin());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown operations monitoring error." }, { status: 500 });
  }
}
