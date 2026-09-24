import { NextRequest, NextResponse } from "next/server";
import { isGrowthCrmHost } from "@/lib/hosts";
import { isFridayInToronto, runAgentWeeklyReportJob } from "@/lib/agent-weekly-report-job";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

function isEnabledOnThisProject(request: NextRequest): boolean {
  const override = process.env.AGENT_WEEKLY_REPORT_CRON_ENABLED;
  if (override === "true") return true;
  if (override === "false") return false;
  return isGrowthCrmHost(request.nextUrl.hostname);
}

export async function GET(request: NextRequest) {
  if (!isEnabledOnThisProject(request)) {
    return NextResponse.json({ skipped: true, reason: "This is not the Growth CRM project." });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
  if (!dryRun && !isFridayInToronto()) {
    return NextResponse.json({ skipped: true, reason: "Today is not Friday in Toronto." });
  }

  try {
    return NextResponse.json(await runAgentWeeklyReportJob({ dryRun }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown weekly agent report error." },
      { status: 500 }
    );
  }
}
