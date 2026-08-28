import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";

// Secure, single-purpose, expiring tokens for the Client Onboarding
// workflow's two public pages (the agreement-sign link and the
// client-intake link) - same convention as
// src/lib/winsalot-consultation-tokens.ts: a fresh cryptographically-
// random uuid minted per send, resolved through the service-role client
// only, never a raw crm_client_agreements/crm_intake_configs id exposed
// to a public visitor.

const AGREEMENT_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days - an agreement can sit unsigned for a while
const INTAKE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function createAgreementToken(agreementId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("crm_agreement_tokens")
    .insert({ agreement_id: agreementId, expires_at: new Date(Date.now() + AGREEMENT_TOKEN_TTL_MS).toISOString() })
    .select("token")
    .single();

  if (error || !data) throw new Error("Failed to create a secure agreement link.");
  return data.token as string;
}

export type AgreementTokenLookupResult = { ok: true; agreementId: string } | { ok: false; error: string };

// Resolves a sign-link token for VIEWING the agreement - does not mark
// it opened by itself (the caller records the "opened" milestone/event
// the first time this succeeds for a given agreement, same pattern as
// every other "first time this happened" flag in this codebase).
export async function resolveAgreementToken(token: string): Promise<AgreementTokenLookupResult> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("crm_agreement_tokens").select("agreement_id, expires_at").eq("token", token).maybeSingle();

  if (!data || !data.agreement_id) return { ok: false, error: "This link is invalid." };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, error: "This link has expired." };
  return { ok: true, agreementId: data.agreement_id as string };
}

// Atomically claims the token at the moment the client actually accepts
// the agreement - a concurrent double-submit (two tabs, a replayed
// request) can only ever win once.
export async function consumeAgreementToken(token: string): Promise<AgreementTokenLookupResult> {
  const admin = getSupabaseAdmin();
  const { data: tokenRow } = await admin.from("crm_agreement_tokens").select("agreement_id, expires_at, used_at").eq("token", token).maybeSingle();

  if (!tokenRow || !tokenRow.agreement_id) return { ok: false, error: "This link is invalid." };
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) return { ok: false, error: "This link has expired." };
  if (tokenRow.used_at) return { ok: false, error: "This agreement has already been signed." };

  const { data: claimed } = await admin
    .from("crm_agreement_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("agreement_id")
    .maybeSingle();

  if (!claimed) return { ok: false, error: "This agreement has already been signed." };
  return { ok: true, agreementId: claimed.agreement_id as string };
}

export async function markAgreementTokenOpened(token: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("crm_agreement_tokens").update({ opened_at: new Date().toISOString() }).eq("token", token).is("opened_at", null);
}

export async function createIntakeToken(intakeConfigId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("crm_intake_tokens")
    .insert({ intake_config_id: intakeConfigId, expires_at: new Date(Date.now() + INTAKE_TOKEN_TTL_MS).toISOString() })
    .select("token")
    .single();

  if (error || !data) throw new Error("Failed to create a secure intake link.");
  return data.token as string;
}

export type IntakeTokenLookupResult = { ok: true; intakeConfigId: string } | { ok: false; error: string };

export async function resolveIntakeToken(token: string): Promise<IntakeTokenLookupResult> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("crm_intake_tokens").select("intake_config_id, expires_at").eq("token", token).maybeSingle();

  if (!data || !data.intake_config_id) return { ok: false, error: "This link is invalid." };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, error: "This link has expired." };
  return { ok: true, intakeConfigId: data.intake_config_id as string };
}

export async function consumeIntakeToken(token: string): Promise<IntakeTokenLookupResult> {
  const admin = getSupabaseAdmin();
  const { data: tokenRow } = await admin.from("crm_intake_tokens").select("intake_config_id, expires_at, used_at").eq("token", token).maybeSingle();

  if (!tokenRow || !tokenRow.intake_config_id) return { ok: false, error: "This link is invalid." };
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) return { ok: false, error: "This link has expired." };
  if (tokenRow.used_at) return { ok: false, error: "This intake form has already been submitted." };

  const { data: claimed } = await admin
    .from("crm_intake_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("intake_config_id")
    .maybeSingle();

  if (!claimed) return { ok: false, error: "This intake form has already been submitted." };
  return { ok: true, intakeConfigId: claimed.intake_config_id as string };
}

export async function markIntakeTokenOpened(token: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("crm_intake_tokens").update({ opened_at: new Date().toISOString() }).eq("token", token).is("opened_at", null);
}
