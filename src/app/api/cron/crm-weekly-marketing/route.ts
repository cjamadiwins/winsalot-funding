import { NextRequest, NextResponse } from "next/server";
import { runCrmMarketingJob } from "@/lib/crm-marketing-job";
import { isGrowthCrmHost } from "@/lib/hosts";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

function isEnabledOnThisProject(request: NextRequest): boolean {
  const override = process.env.CRM_MARKETING_CRON_ENABLED;
  if (override === "true") return true;
  if (override === "false") return false;
  return isGrowthCrmHost(request.nextUrl.hostname);
}

export async function GET(request: NextRequest) {
  // This repository is deployed to both Winsalot CRM projects. Only the
  // Growth project's known custom/preview hosts may run this worker,
  // preventing duplicate sends without requiring a new environment flag.
  // CRM_MARKETING_CRON_ENABLED remains an explicit emergency override.
  if (!isEnabledOnThisProject(request)) {
    return NextResponse.json({ skipped: true, reason: "This is not the Growth CRM project." });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
    return NextResponse.json(await runCrmMarketingJob({ dryRun }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown weekly marketing job error." },
      { status: 500 }
    );
  }
}
