import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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

// `active` (migration 0120) is what a Resubscribe clears - the row itself
// is never deleted, so the original reason/suppressed_at/opportunity_id
// (and, once resubscribed, who/when/how) stay on this same row for good.
export type CrmEmailSuppressionRow = {
  email: string;
  reason: string;
  opportunity_id: string | null;
  suppressed_at: string;
  active: boolean;
  resubscribed_at: string | null;
  resubscribed_by: string | null;
  resubscribe_consent_method: string | null;
};

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("crm_email_suppressions")
    .select("email")
    .eq("email", normalizeEmail(email))
    .eq("active", true)
    .maybeSingle();
  return !!data;
}

// Full suppression row for one email, active or not - used by the admin
// opportunity detail page to show the original unsubscribe reason/date
// next to the Resubscribe control. Returns null when this address has
// never been suppressed at all.
export async function getEmailSuppression(email: string): Promise<CrmEmailSuppressionRow | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("crm_email_suppressions")
    .select("*")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  return (data as CrmEmailSuppressionRow) ?? null;
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

  // `active`/`suppressed_at` are set explicitly (not just left to their
  // column defaults) because upsert's ON CONFLICT UPDATE only ever
  // touches columns present in this payload - without them, a real
  // second unsubscribe click from someone an admin had previously
  // Resubscribed would silently leave `active` at its now-stale `false`
  // and never actually re-suppress them.
  const { error } = await admin.from("crm_email_suppressions").upsert(
    {
      email: tokenRow.email,
      opportunity_id: tokenRow.opportunity_id,
      reason: "unsubscribed",
      active: true,
      suppressed_at: new Date().toISOString(),
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

// ---------------------------------------------------------------------
// Admin-only "Resubscribe". Callers must already have run
// requireCrmAdmin() and pass the *session-scoped* Supabase client (same
// convention as sendProspectEmail) - an agent can never reach this, both
// because requireCrmAdmin() itself redirects a non-admin away from every
// page that could call it, and because crm_marketing_enrollments/
// crm_email_resubscribe_audit's own RLS policies independently require
// crm_user_role(auth.uid()) = 'admin' regardless of what the caller does.
//
// "permission_only" clears the suppression so this address can receive
// individual emails (consultation invites, etc.) again, but leaves
// crm_marketing_enrollments exactly as it is - if that enrollment is
// still 'unsubscribed' from when this address unsubscribed, the weekly
// sequence stays stopped. "reenroll_marketing" does that *and* resets
// (or creates) the crm_marketing_enrollments row to start over from
// Email 1 (send_count 0), with its own fresh express-consent record
// tied to this exact resubscribe.
// ---------------------------------------------------------------------

export type ResubscribeScope = "permission_only" | "reenroll_marketing";

export type ResubscribeInput = {
  email: string;
  opportunityId: string;
  adminId: string;
  adminName: string;
  consentMethod: string;
  consentDate: string;
  scope: ResubscribeScope;
};

export type ResubscribeResult = { error?: string; success?: string };

export async function resubscribeEmail(supabase: SupabaseClient, input: ResubscribeInput): Promise<ResubscribeResult> {
  const email = normalizeEmail(input.email);
  const consentMethod = input.consentMethod.trim();
  if (!consentMethod) return { error: "Describe how the recipient asked to receive emails again." };
  if (!input.consentDate) return { error: "Enter the date the recipient asked to receive emails again." };

  const admin = getSupabaseAdmin();
  const { data: suppression } = await admin
    .from("crm_email_suppressions")
    .select("active")
    .eq("email", email)
    .maybeSingle();
  if (!suppression?.active) {
    return { error: "This email address is not currently unsubscribed." };
  }

  // Re-enrolling in the weekly sequence needs a live, emailable,
  // still-open opportunity - re-validated here (not just trusted from
  // the page the admin is looking at) exactly like
  // enrollMarketingContactAction does for a brand-new enrollment.
  let opportunityType: string | null = null;
  if (input.scope === "reenroll_marketing") {
    const { data: opportunity } = await supabase
      .from("crm_opportunities")
      .select("email, stage, opportunity_type")
      .eq("id", input.opportunityId)
      .maybeSingle();
    if (!opportunity) return { error: "The linked business record could not be found." };
    if (!opportunity.email?.trim()) return { error: "Add an email address to this business record before re-enrolling it." };
    if (["Client Won", "Not Interested"].includes(opportunity.stage)) {
      return { error: `This business cannot be re-enrolled in Email Marketing because it is ${opportunity.stage}.` };
    }
    opportunityType = opportunity.opportunity_type;
  }

  const { error: suppressionError } = await admin
    .from("crm_email_suppressions")
    .update({
      active: false,
      resubscribed_at: input.consentDate,
      resubscribed_by: input.adminId,
      resubscribe_consent_method: consentMethod,
    })
    .eq("email", email);
  if (suppressionError) return { error: `Could not clear the unsubscribe status: ${suppressionError.message}` };

  const { error: auditError } = await supabase.from("crm_email_resubscribe_audit").insert({
    email,
    opportunity_id: input.opportunityId,
    admin_id: input.adminId,
    admin_name: input.adminName,
    consent_date: input.consentDate,
    consent_method: consentMethod,
    re_enrolled_marketing: input.scope === "reenroll_marketing",
  });
  if (auditError) return { error: `The unsubscribe status was cleared, but the audit log entry failed: ${auditError.message}` };

  await supabase.from("crm_activities").insert({
    opportunity_id: input.opportunityId,
    agent_id: input.adminId,
    activity_type: "email_resubscribed",
    notes:
      input.scope === "reenroll_marketing"
        ? `Resubscribed by ${input.adminName} and re-enrolled in weekly Email Marketing from Email 1. Recipient's request: ${consentMethod}`
        : `Resubscribed by ${input.adminName} (individual emails only — not re-enrolled in weekly Email Marketing). Recipient's request: ${consentMethod}`,
  });

  if (input.scope === "reenroll_marketing" && opportunityType) {
    const now = new Date().toISOString();
    const { error: enrollError } = await supabase.from("crm_marketing_enrollments").upsert(
      {
        opportunity_id: input.opportunityId,
        campaign_type: opportunityType,
        status: "active",
        consent_basis: "express",
        consent_notes: `Resubscribed by ${input.adminName} on ${input.consentDate.slice(0, 10)}: ${consentMethod}`,
        consent_recorded_at: input.consentDate,
        consent_recorded_by: input.adminId,
        cadence_days: 7,
        next_send_at: now,
        last_sent_at: null,
        send_count: 0,
        last_error: null,
        paused_at: null,
        stopped_at: null,
        claim_token: null,
        claimed_at: null,
        removed_at: null,
        created_by: input.adminId,
        updated_at: now,
      },
      { onConflict: "opportunity_id" }
    );
    if (enrollError) return { error: `Resubscribed, but re-enrolling in Email Marketing failed: ${enrollError.message}` };
  }

  return {
    success:
      input.scope === "reenroll_marketing"
        ? "Resubscribed and re-enrolled in weekly Email Marketing starting from Email 1."
        : "Resubscribed. Individual emails can be sent again — weekly Email Marketing was not changed.",
  };
}
