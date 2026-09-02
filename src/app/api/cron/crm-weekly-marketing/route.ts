import { NextRequest, NextResponse } from "next/server";
import { runCrmMarketingJob } from "@/lib/crm-marketing-job";
import { isGrowthCrmHost } from "@/lib/hosts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hardens against accidental env formatting issues (leading/trailing
// whitespace/newlines or quoted value pasted from a UI/CLI export) - same
// normalization already applied to the Resend webhook secrets in
// src/app/api/webhooks/resend/route.ts.
function normalizeCronSecret(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/^['"]|['"]$/g, "");
  return trimmed ? trimmed : undefined;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = normalizeCronSecret(process.env.CRON_SECRET);
  if (!secret) {
    // Vercel automatically sends CRON_SECRET as this route's Bearer token
    // on every scheduled invocation (see vercel.json's `crons` entry for
    // this path and .env.example's CRON_SECRET documentation) - but only
    // once the var is actually set as a Vercel project env var for the
    // environment handling the request (Production), and only on
    // deployments built *after* it was set. Logging this distinctly from
    // "header didn't match" below means a 401 here is diagnosable from
    // Vercel's runtime logs alone, without ever printing the secret
    // itself.
    console.error(
      "[cron:crm-weekly-marketing] CRON_SECRET is not set on this deployment - due contacts cannot be processed. " +
        "Set it in Vercel Project Settings -> Environment Variables (Production) on the winsalot-funding project specifically " +
        "(the Lead Gen CRM project's CRON_SECRET is a separate value on a separate project), then redeploy - " +
        "the fix does not take effect until a new deployment is built. Rejecting request."
    );
    return false;
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    console.error(
      "[cron:crm-weekly-marketing] Authorization header did not match the configured CRON_SECRET - rejecting request. " +
        "A genuine Vercel Cron invocation always sends the correct header automatically once CRON_SECRET is set on this " +
        "project; a manual test call needs its own `Authorization: Bearer <value>` header set explicitly."
    );
    return false;
  }
  return true;
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
