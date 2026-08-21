import { NextRequest, NextResponse } from "next/server";
import { runLeadgenBusinessAppointmentReminderJob } from "@/lib/leadgen-business-appointment-reminders";

// Automatic BUSINESS-facing (24-hour + 1-hour) appointment reminder job -
// reminds the CRM client (e.g. Brent's Essentials) about their own
// upcoming booked/confirmed appointments. See the header comment in
// supabase/migrations/0068_leadgen_business_appointment_reminders.sql for
// why this route is invoked by Supabase's pg_cron/pg_net (roughly every
// 15 minutes) rather than by vercel.json's Vercel Cron entry, which is
// limited to once a day on this Hobby-plan account and can't deliver a
// meaningful "1 hour before" reminder. This route still authenticates
// exactly like every other cron route in this app - a plain GET with
// `Authorization: Bearer <secret>` - it's only the caller that's
// different.
//
// Reuses LEADGEN_REMINDER_CRON_ENABLED, the same per-project gate the
// existing leadgen-appointment-reminders cron uses, so this can never do
// anything on the winsalot-funding (Cleaning CRM) deployment either -
// both this repo's Vercel projects share one codebase, and only
// winsalot-leadgen-crm (Production) should ever have that env var set to
// "true". Authenticates against its own dedicated
// LEADGEN_BUSINESS_REMINDER_CRON_SECRET (not the shared CRON_SECRET),
// since the caller here is Supabase's pg_net, not Vercel Cron - keeping
// the two secrets independent means rotating one never affects the
// other's caller.
export const maxDuration = 60;

function isEnabledOnThisProject(): boolean {
  return process.env.LEADGEN_REMINDER_CRON_ENABLED === "true";
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.LEADGEN_BUSINESS_REMINDER_CRON_SECRET;
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
    const summary = await runLeadgenBusinessAppointmentReminderJob({ dryRun });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error running the business appointment reminder job." },
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
