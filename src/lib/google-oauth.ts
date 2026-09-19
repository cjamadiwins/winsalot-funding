import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CallListCrm } from "./call-list-types";

// Minimal, dependency-free Google OAuth2 + userinfo client - plain fetch
// calls against Google's documented REST endpoints, the same "no SDK,
// just fetch + manual verification" convention this app already uses for
// Calendly/Twilio, rather than pulling in the large `googleapis` package
// for what is otherwise three HTTP calls.
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

// Read-only - this feature only ever reads a Sheet; Google Sheets always
// stays the editable master list, never written to by the CRM.
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

export function getGoogleOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured on this deployment.");
  }
  return { clientId, clientSecret };
}

// Signed, stateless CSRF/replay-protection token carried through the
// Google consent redirect - avoids needing a server-side session/state
// table just for a ten-minute round trip. Reuses the same secret as
// crypto-secrets.ts's AES key; HMAC has no fixed-length requirement on
// its key the way AES-256 does, so the raw configured value works as-is.
export type GoogleOAuthState = {
  crm: CallListCrm;
  adminUserId: string;
  returnTo: string;
  iat: number;
};

function stateSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is not set.");
  return secret;
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function signOAuthState(state: GoogleOAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(token: string): GoogleOAuthState | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) return null;

  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleOAuthState;
    if (typeof state.iat !== "number" || Date.now() - state.iat > STATE_MAX_AGE_MS) return null;
    return state;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(params: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  // offline + consent so Google always issues a refresh_token, even for
  // an admin who has authorized this app before.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", `${SHEETS_SCOPE} openid email`);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google rejected the sign-in (${res.status}). Please try connecting again.`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google refused to refresh this connection's access token (${res.status}). It may need to be reconnected.`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch(GOOGLE_USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Could not read the connected Google account's email (${res.status}).`);
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error("Google did not return an account email for this connection.");
  return data.email;
}
