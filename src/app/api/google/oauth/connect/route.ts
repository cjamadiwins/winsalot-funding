import { NextRequest, NextResponse } from "next/server";
import { isGrowthCrmHost, isLeadGenHost } from "@/lib/hosts";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { buildGoogleAuthUrl, getGoogleOAuthCredentials, signOAuthState } from "@/lib/google-oauth";

export const runtime = "nodejs";

// Shared by both CRMs (this single Next.js deployment serves both hosts -
// see src/lib/hosts.ts) - which CRM an Admin is connecting for is decided
// entirely by which host this request arrived on, the same way every
// other host-aware route in this app already works, never by a client-
// supplied parameter.
export async function GET(request: NextRequest) {
  const host = request.nextUrl.hostname;
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";

  let crm: "growth" | "lead_generation";
  let adminUserId: string;

  // A host matching neither Set (local dev / an unrecognized preview
  // domain) falls back to the Growth CRM's own gate, same fallback
  // hosts.ts's own authCookieName() already uses.
  if (isLeadGenHost(host) && !isGrowthCrmHost(host)) {
    crm = "lead_generation";
    const admin = await requireLeadgenAdmin();
    adminUserId = admin.id;
  } else {
    crm = "growth";
    const admin = await requireCrmAdmin();
    adminUserId = admin.id;
  }

  let clientId: string;
  try {
    ({ clientId } = getGoogleOAuthCredentials());
  } catch {
    return NextResponse.json({ error: "Google OAuth is not configured on this deployment." }, { status: 500 });
  }

  const redirectUri = `${request.nextUrl.origin}/api/google/oauth/callback`;
  const state = signOAuthState({ crm, adminUserId, returnTo, iat: Date.now() });

  return NextResponse.redirect(buildGoogleAuthUrl({ clientId, redirectUri, state }));
}
