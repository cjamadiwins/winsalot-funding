import { NextRequest, NextResponse } from "next/server";
import { runLeadgenAppointmentReminderJob } from "@/lib/leadgen-appointment-reminders";

// Automatic 24-hour appointment reminder job (brief "AUTOMATIC REMINDER"
// / "SCHEDULING") - same auth pattern as the existing cleaning-opportunities
// cron (src/app/api/cron/cleaning-opportunities/route.ts): Vercel Cron
// invokes this with GET and an `Authorization: Bearer $CRON_SECRET`
// header automatically added whenever CRON_SECRET is set as a project env
// var (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
// Works today for manual smoke-testing with the same header, independent
// of whether the `crons` entry in vercel.json is actually deployed.
//
// This one route.ts is shared by both Vercel projects deployed from this
// repo (cleaning.winsalotcorp.com and leads.winsalotcorp.com - see the
// header comment on src/app/api/webhooks/resend/route.ts for the same
// two-projects-one-repo situation). Vercel has no way to give the two
// projects different `crons` entries from one shared vercel.json, so both
// projects register this schedule. LEADGEN_REMINDER_CRON_ENABLED gates the
// route itself: it must be set to exactly "true" as a project env var on
// winsalot-leadgen-crm (Production) only, never on winsalot-funding. Every
// invocation on winsalot-funding hits the guard below and returns
// immediately - no Supabase read, no Resend call, no claim row - which is
// the practical equivalent of "not registered" on that project. As a
// second, independent line of defense, the database-level atomic claim in
// runLeadgenAppointmentReminderJob (see lib/leadgen-appointment-reminders.ts)
// would also make a second concurrent invocation harmless even without
// this guard.
export const maxDuration = 60;

function isEnabledOnThisProject(): boolean {
  return process.env.LEADGEN_REMINDER_CRON_ENABLED === "true";
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isEnabledOnThisProject()) {
    return NextResponse.json(
      { skipped: true, reason: "LEADGEN_REMINDER_CRON_ENABLED is not set to true on this Vercel project." },
      { status: 200 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?dryRun=true computes exactly which appointments would be reminded
  // and to which address, without sending anything or writing a claim
  // row - safe to run against production data at any time to verify
  // targeting before turning the automatic_reminders_enabled setting on.
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const summary = await runLeadgenAppointmentReminderJob({ dryRun });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error running the appointment reminder job." },
      { status: 500 }
    );
  }
}
