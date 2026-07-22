import { NextRequest, NextResponse } from "next/server";
import { runOpportunityCollection } from "@/lib/opportunities/run";

// Daily Active Cleaning Opportunities collection job. Vercel Cron invokes
// this with GET and an `Authorization: Bearer $CRON_SECRET` header
// automatically added whenever CRON_SECRET is set as a project env var -
// see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
// No `crons` entry exists in vercel.json yet (kept disabled until you turn
// it on - see docs/active-cleaning-opportunities.md), but this route works
// today for manual smoke-testing with the same header.
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runOpportunityCollection();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error running collection" },
      { status: 500 }
    );
  }
}
