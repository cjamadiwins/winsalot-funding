import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { WinsalotTokenPurpose } from "./winsalot-consultation-types";

// Secure, single-purpose, expiring tokens for the consultation-booking
// system - same convention as crm_unsubscribe_tokens (migration 0087):
// a fresh cryptographically-random uuid minted per use, resolved through
// the service-role client only, never a raw crm_opportunities/
// winsalot_appointments id exposed to a public visitor. A prefill token
// only ever reveals the single prospect record it was minted for; a
// reschedule/cancel token only the single appointment it was minted for.

const PREFILL_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days - covers a prospect opening an old invite email
const ACTION_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days - a reschedule/cancel link must keep working well past the appointment date

export async function createWinsalotPrefillToken(opportunityId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("winsalot_appointment_tokens")
    .insert({
      purpose: "prefill",
      opportunity_id: opportunityId,
      expires_at: new Date(Date.now() + PREFILL_TOKEN_TTL_MS).toISOString(),
    })
    .select("token")
    .single();

  if (error || !data) throw new Error("Failed to create a booking link.");
  return data.token as string;
}

export async function createWinsalotActionToken(
  purpose: Extract<WinsalotTokenPurpose, "reschedule" | "cancel">,
  appointmentId: string
): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("winsalot_appointment_tokens")
    .insert({
      purpose,
      appointment_id: appointmentId,
      expires_at: new Date(Date.now() + ACTION_TOKEN_TTL_MS).toISOString(),
    })
    .select("token")
    .single();

  if (error || !data) throw new Error(`Failed to create a ${purpose} link.`);
  return data.token as string;
}

export type PrefillLookupResult =
  | { ok: true; opportunityId: string }
  | { ok: false };

// Resolves a prefill token to its opportunity id - never anything else
// about the token or opportunity is returned here; the caller (the
// public booking page) still only ever reads the prospect's own
// prefillable fields (name/business/email/phone/service type) through a
// dedicated, narrow query, same pattern as sendProspectEmail's own
// narrow select.
export async function resolveWinsalotPrefillToken(token: string): Promise<PrefillLookupResult> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("winsalot_appointment_tokens")
    .select("opportunity_id, expires_at")
    .eq("token", token)
    .eq("purpose", "prefill")
    .maybeSingle();

  if (!data || !data.opportunity_id) return { ok: false };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false };
  return { ok: true, opportunityId: data.opportunity_id as string };
}

export type ActionTokenLookupResult =
  | { ok: true; appointmentId: string }
  | { ok: false; error: string };

// Resolves + validates a reschedule/cancel token for VIEWING the linked
// appointment (page render) - does not consume it. The action that
// actually reschedules/cancels calls consumeWinsalotActionToken instead,
// at the moment it executes, so a prospect can safely open the link and
// look without burning it.
export async function lookupWinsalotActionToken(
  token: string,
  purpose: Extract<WinsalotTokenPurpose, "reschedule" | "cancel">
): Promise<ActionTokenLookupResult> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("winsalot_appointment_tokens")
    .select("appointment_id, expires_at, used_at")
    .eq("token", token)
    .eq("purpose", purpose)
    .maybeSingle();

  if (!data || !data.appointment_id) return { ok: false, error: "This link is invalid." };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, error: "This link has expired." };
  if (data.used_at) return { ok: false, error: "This link has already been used." };
  return { ok: true, appointmentId: data.appointment_id as string };
}

// Atomically claims the token at the moment the reschedule/cancel action
// actually executes - a concurrent double-submit (two tabs, a replayed
// request) can only ever win once.
export async function consumeWinsalotActionToken(
  token: string,
  purpose: Extract<WinsalotTokenPurpose, "reschedule" | "cancel">
): Promise<ActionTokenLookupResult> {
  const admin = getSupabaseAdmin();
  const { data: tokenRow } = await admin
    .from("winsalot_appointment_tokens")
    .select("appointment_id, expires_at, used_at")
    .eq("token", token)
    .eq("purpose", purpose)
    .maybeSingle();

  if (!tokenRow || !tokenRow.appointment_id) return { ok: false, error: "This link is invalid." };
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) return { ok: false, error: "This link has expired." };
  if (tokenRow.used_at) return { ok: false, error: "This link has already been used." };

  const { data: claimed } = await admin
    .from("winsalot_appointment_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("appointment_id")
    .maybeSingle();

  if (!claimed) return { ok: false, error: "This link has already been used." };
  return { ok: true, appointmentId: claimed.appointment_id as string };
}

// Reverts a token's used_at back to null - only ever called by the
// caller of consumeWinsalotActionToken when the action it provisionally
// claimed the token for turns out to fail (e.g. the newly-selected slot
// was booked by someone else in the meantime, or any other error from
// performWinsalotReschedule/performWinsalotCancellation), so the exact
// same link keeps working for the prospect to retry. Consuming first
// (rather than only marking used after success) still matters - it's
// what makes two concurrent submits of the same link mutually exclusive
// - this just undoes that claim when nothing actually happened. Never
// called after the action actually succeeded.
export async function releaseWinsalotActionToken(
  token: string,
  purpose: Extract<WinsalotTokenPurpose, "reschedule" | "cancel">
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("winsalot_appointment_tokens").update({ used_at: null }).eq("token", token).eq("purpose", purpose);
}
