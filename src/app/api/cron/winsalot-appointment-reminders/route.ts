import { NextRequest, NextResponse } from "next/server";
import { runWinsalotAppointmentReminderJob } from "@/lib/winsalot-consultation-reminders";

// Automatic 24-hour + 1-hour Winsalot consultation reminder job. Invoked
// by Supabase's pg_cron/pg_net roughly every 15 minutes (see the header
// comment in supabase/migrations/0088_winsalot_consultations.sql) rather
// than Vercel Cron, which is limited to once a day on this account's
// Hobby plan and can't deliver a meaningful "1 hour before" reminder -
// same rationale, and same Authorization: Bearer <secret> pattern, as the
// Lead Gen CRM's existing leadgen-business-appointment-reminders route,
// but authenticated against its own dedicated
// WINSALOT_APPOINTMENT_REMINDER_CRON_SECRET so rotating one project's
// cron secret never affects the other's.
export const maxDuration = 60;

// Logs which specific check failed (never the secret value itself) so a 401
// here can be diagnosed from Vercel runtime logs alone - distinguishing "env
// var missing on this deployment" from "header present but doesn't match"
// previously required cross-referencing Supabase Vault and Vercel by hand.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.WINSALOT_APPOINTMENT_REMINDER_CRON_SECRET;
  if (!secret) {
    console.warn("winsalot-appointment-reminders: WINSALOT_APPOINTMENT_REMINDER_CRON_SECRET is not set on this deployment");
    return false;
  }
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    console.warn(
      `winsalot-appointment-reminders: authorization header ${header ? "did not match the configured secret" : "was missing"}`
    );
    return false;
  }
  return true;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const summary = await runWinsalotAppointmentReminderJob({ dryRun });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error running the Winsalot appointment reminder job." },
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
