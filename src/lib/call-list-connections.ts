import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { encryptSecret } from "./crypto-secrets";
import type { CallListCrm, CallListGoogleConnectionRow } from "./call-list-types";

// call_list_google_connections has RLS enabled with NO policies at all
// (see the migration's header note) - every read/write here goes through
// the service-role client, exactly like src/lib/dnc-suppression.ts does
// for crm_dnc_suppressions. Every exported function assumes its caller
// has already run requireCrmAdmin()/requireLeadgenAdmin().

export async function listGoogleConnections(crm: CallListCrm): Promise<CallListGoogleConnectionRow[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("call_list_google_connections")
    .select("*")
    .eq("crm", crm)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return (data ?? []) as CallListGoogleConnectionRow[];
}

export async function getGoogleConnection(id: string): Promise<CallListGoogleConnectionRow | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("call_list_google_connections").select("*").eq("id", id).maybeSingle();
  return (data as CallListGoogleConnectionRow) ?? null;
}

export async function saveGoogleConnection(input: {
  crm: CallListCrm;
  connectedBy: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope: string;
}): Promise<CallListGoogleConnectionRow> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("call_list_google_connections")
    .insert({
      crm: input.crm,
      connected_by: input.connectedBy,
      google_email: input.googleEmail,
      access_token_encrypted: encryptSecret(input.accessToken),
      refresh_token_encrypted: encryptSecret(input.refreshToken),
      token_expires_at: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      scope: input.scope,
      status: "active",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save the Google connection.");
  return data as CallListGoogleConnectionRow;
}

export async function revokeGoogleConnection(id: string, revokedBy: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("call_list_google_connections")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq("id", id);
}
