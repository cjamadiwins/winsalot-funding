import { NextRequest, NextResponse } from "next/server";
import { runLeadgenProspect1HourReminderJob } from "@/lib/leadgen-appointment-reminders";

// Automatic 1-HOUR prospect-facing appointment reminder job - the second
// reminder interval for the person actually attending the appointment,
// alongside the existing 24-hour reminder
// (/api/cron/leadgen-appointment-reminders, unchanged). See the header
// comment in supabase/migrations/0124_leadgen_prospect_1hour_reminder.sql
// for why this is invoked by Supabase's pg_cron/pg_net (roughly every 15
// minutes) rather than vercel.json's Vercel Cron entry, which is limited
// to once a day on this Hobby-plan account and can't deliver a
// meaningful "1 hour before" reminder. This route still authenticates
// exactly like every other cron route in this app - a plain GET/POST
// with `Authorization: Bearer <secret>`.
//
// Reuses LEADGEN_REMINDER_CRON_ENABLED, the same per-project gate the
// existing prospect/business reminder crons use, so this can never do
// anything on the winsalot-funding (Growth CRM) deployment either.
// Authenticates against its own dedicated
// LEADGEN_PROSPECT_1HOUR_REMINDER_CRON_SECRET (not the shared
// CRON_SECRET or the business reminder's secret), since the caller here
// is Supabase's pg_net, not Vercel Cron - keeping every cron route's
// secret independent means rotating one never affects another's caller.
export const maxDuration = 60;

function isEnabledOnThisProject(): boolean {
  return process.env.LEADGEN_REMINDER_CRON_ENABLED === "true";
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.LEADGEN_PROSPECT_1HOUR_REMINDER_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: NextRequest) {
  if (!isEnabledOnThisProject()) {
    return NextResponse.json(
      { skipped: true, reason: "LEADGEN_REMINDER_CRON_ENABLED is not set to true on this Vercel project." },
      { status: 200 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const summary = await runLeadgenProspect1HourReminderJob({ dryRun });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error running the prospect 1-hour reminder job." },
      { status: 500 }
    );
  }
}

// GET for manual/browser testing with the same Authorization header; POST
// for pg_net's net.http_post, which issues a POST.
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
