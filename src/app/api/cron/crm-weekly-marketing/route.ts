import { NextRequest, NextResponse } from "next/server";
import { runCrmMarketingJob } from "@/lib/crm-marketing-job";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  // This repository is deployed to both Winsalot CRM projects. Only the
  // Growth project may enable this worker, preventing duplicate sends.
  if (process.env.CRM_MARKETING_CRON_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "CRM_MARKETING_CRON_ENABLED is not true on this project." });
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
