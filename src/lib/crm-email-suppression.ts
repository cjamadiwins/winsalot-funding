import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";

// Suppression-list system for the Growth CRM's prospect emails (crm_email_suppressions,
// crm_unsubscribe_tokens - migration 0087). No equivalent existed before
// this: the Lead Gen CRM's leadgen_bounced_emails is a separate product's
// table that only blocks on a hard bounce, never a genuine unsubscribe
// click. Both tables here are service-role only (RLS enabled, no
// policies), same pattern as crm_lead_emails.

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("crm_email_suppressions")
    .select("email")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  return !!data;
}

// Minted fresh for every prospect email sent (never reused across sends),
// so a token only ever identifies the one send it was embedded in and
// can't be replayed to probe for other prospects' addresses.
export async function createUnsubscribeToken(email: string, opportunityId: string | null): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("crm_unsubscribe_tokens")
    .insert({ email: normalizeEmail(email), opportunity_id: opportunityId })
    .select("token")
    .single();

  if (error || !data) {
    throw new Error("Failed to create an unsubscribe link.");
  }
  return data.token as string;
}

export type UnsubscribeResult = { email: string } | { error: string };

// Called by the public /unsubscribe/[token] route - no auth, so this must
// never reveal anything beyond "this token worked" or "it didn't."
// Upserting on the email (not the token) means clicking an old link after
// already unsubscribing is a harmless no-op, not an error.
export async function unsubscribeByToken(token: string): Promise<UnsubscribeResult> {
  const admin = getSupabaseAdmin();
  const { data: tokenRow } = await admin
    .from("crm_unsubscribe_tokens")
    .select("email, opportunity_id")
    .eq("token", token)
    .maybeSingle();

  if (!tokenRow) {
    return { error: "This unsubscribe link is invalid or has already been used." };
  }

  const { error } = await admin.from("crm_email_suppressions").upsert(
    {
      email: tokenRow.email,
      opportunity_id: tokenRow.opportunity_id,
      reason: "unsubscribed",
    },
    { onConflict: "email" }
  );

  if (error) {
    return { error: "Failed to process the unsubscribe request. Please try again." };
  }

  // A marketing enrollment is the scheduler's source of truth. Updating it
  // immediately means an unsubscribe click stops the weekly campaign even
  // before the next cron run performs its own suppression-list check.
  if (tokenRow.opportunity_id) {
    await admin
      .from("crm_marketing_enrollments")
      .update({
        status: "unsubscribed",
        stopped_at: new Date().toISOString(),
        claim_token: null,
        claimed_at: null,
        last_error: "Recipient unsubscribed from Winsalot marketing emails.",
        updated_at: new Date().toISOString(),
      })
      .eq("opportunity_id", tokenRow.opportunity_id);
  }

  return { email: tokenRow.email as string };
}
