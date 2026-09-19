import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchGoogleEmail, getGoogleOAuthCredentials, verifyOAuthState } from "@/lib/google-oauth";
import { saveGoogleConnection } from "@/lib/call-list-connections";

export const runtime = "nodejs";

// Google redirects here after the Admin grants (or denies) access. The
// `state` param is the only thing tying this request back to a specific
// admin/CRM/return path - verified via HMAC (see signOAuthState), not
// trusted as-is. A relative `returnTo` only (never an absolute URL) keeps
// this from ever being used as an open redirect.
export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");

  const state = stateParam ? verifyOAuthState(stateParam) : null;
  const returnTo = state && state.returnTo.startsWith("/") ? state.returnTo : "/";
  const redirectWithError = (message: string) => {
    const url = new URL(returnTo, request.nextUrl.origin);
    url.searchParams.set("googleConnectError", message);
    return NextResponse.redirect(url);
  };

  if (error) return redirectWithError(error === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in failed.");
  if (!code || !state) return redirectWithError("This connection link expired or was invalid. Please try again.");

  try {
    const { clientId, clientSecret } = getGoogleOAuthCredentials();
    const redirectUri = `${request.nextUrl.origin}/api/google/oauth/callback`;
    const tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });

    if (!tokens.refresh_token) {
      return redirectWithError(
        "Google did not grant a persistent connection. If this Google account was previously connected, remove Winsalot's access at myaccount.google.com/permissions and try again."
      );
    }

    const googleEmail = await fetchGoogleEmail(tokens.access_token);
    const connection = await saveGoogleConnection({
      crm: state.crm,
      connectedBy: state.adminUserId,
      googleEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      scope: tokens.scope,
    });

    const url = new URL(returnTo, request.nextUrl.origin);
    url.searchParams.set("googleConnectionId", connection.id);
    return NextResponse.redirect(url);
  } catch (err) {
    return redirectWithError(err instanceof Error ? err.message : "Could not complete the Google connection.");
  }
}
