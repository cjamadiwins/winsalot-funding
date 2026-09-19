import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { decryptSecret, encryptSecret } from "./crypto-secrets";
import { getGoogleOAuthCredentials, refreshAccessToken } from "./google-oauth";
import type { CallListGoogleConnectionRow } from "./call-list-types";

// Plain-fetch Google Sheets API v4 client - see google-oauth.ts for why
// this repo doesn't pull in the `googleapis` package for this.
const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;

// Returns a usable access token for this connection, transparently
// refreshing (and persisting the refreshed token) if the stored one is
// expired or about to expire. Every sync and every "list this sheet's
// tabs" call goes through this - callers never touch the stored tokens
// directly.
export async function getValidAccessToken(connection: CallListGoogleConnectionRow): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return decryptSecret(connection.access_token_encrypted);
  }

  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const refreshToken = decryptSecret(connection.refresh_token_encrypted);

  try {
    const tokens = await refreshAccessToken({ refreshToken, clientId, clientSecret });
    const admin = getSupabaseAdmin();
    await admin
      .from("call_list_google_connections")
      .update({
        access_token_encrypted: encryptSecret(tokens.access_token),
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        status: "active",
        last_error: null,
      })
      .eq("id", connection.id);
    return tokens.access_token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh Google access token.";
    const admin = getSupabaseAdmin();
    await admin.from("call_list_google_connections").update({ status: "error", last_error: message }).eq("id", connection.id);
    throw error;
  }
}

export type SheetTab = { title: string; gid: number };

export async function fetchSpreadsheetTabs(accessToken: string, spreadsheetId: string): Promise<{ title: string; tabs: SheetTab[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(
      res.status === 404 || res.status === 403
        ? "Could not open this spreadsheet. Make sure the connected Google account has at least viewer access to it."
        : `Could not read this spreadsheet (Google API error ${res.status}).`
    );
  }
  const data = (await res.json()) as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string; sheetId?: number } }[];
  };
  const tabs = (data.sheets ?? [])
    .map((sheet) => ({ title: sheet.properties?.title ?? "", gid: sheet.properties?.sheetId ?? 0 }))
    .filter((tab) => tab.title.length > 0);
  return { title: data.properties?.title ?? "Untitled spreadsheet", tabs };
}

export type SheetValues = { headers: string[]; rows: string[][] };

// Returns the tab's header row plus every data row, each already padded/
// truncated to line up with the header row's own width so callers never
// index out of bounds.
export async function fetchSheetValues(accessToken: string, spreadsheetId: string, sheetTitle: string): Promise<SheetValues> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
    sheetTitle
  )}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Could not read rows from the "${sheetTitle}" tab (Google API error ${res.status}).`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  const values = data.values ?? [];
  const [headerRow, ...rest] = values;
  const headers = (headerRow ?? []).map((cell) => String(cell ?? "").trim());
  const rows = rest.map((row) => headers.map((_, i) => String(row[i] ?? "").trim()));
  return { headers, rows };
}

// Accepts either a full Google Sheets URL or a bare spreadsheet id.
export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}
