import "server-only";
import { isGrowthCrmHost } from "./hosts";

// Winsalot Growth CRM's real canonical production domain (src/lib/
// hosts.ts). Used below as a hard safety net, not just a placeholder -
// see the comments on getSiteUrl()/getAuthRedirectBaseUrl() for why.
const GROWTH_CRM_CANONICAL_SITE_URL = "https://growth.winsalotcorp.com";

// growth.winsalotcorp.com's own retired predecessor domain (hosts.ts).
// Vercel bakes environment variables into a deployment's serverless
// functions at build/deploy time - editing NEXT_PUBLIC_SITE_URL in the
// dashboard has no effect on any deployment that already exists, only on
// the next one built after the edit (see docs/crm.md's "Rotating
// WINSALOT_APPOINTMENT_REMINDER_CRON_SECRET or WINSALOT_BOOKING_URL..."
// note - the same gap applies here). That gap has repeatedly let this
// exact retired value linger live in production and leak into real
// prospect/internal emails - the "Open in CRM" link and every prospect-
// facing reschedule/cancel link alike, since every one of them is built
// from getSiteUrl() below. Reject this specific known-bad value outright
// rather than trusting whatever is currently saved in Vercel.
const RETIRED_SITE_URL_HOSTS = new Set(["cleaning.winsalotcorp.com", "www.cleaning.winsalotcorp.com"]);

// Rejects an explicit NEXT_PUBLIC_SITE_URL that is malformed or points at
// the retired domain, logging loudly (Vercel runtime logs) so the
// misconfiguration is visible immediately instead of only being noticed
// in a delivered email. Returns null to fall through to this function's
// own further fallbacks when rejected.
function sanitizeExplicitSiteUrl(explicit: string, context: string): string | null {
  let host: string;
  try {
    host = new URL(explicit).host;
  } catch {
    console.error(`[${context}] NEXT_PUBLIC_SITE_URL ("${explicit}") is not a valid URL - ignoring it.`);
    return null;
  }
  if (RETIRED_SITE_URL_HOSTS.has(host)) {
    console.error(
      `[${context}] NEXT_PUBLIC_SITE_URL is set to the retired ${host} - ignoring it. Correct this in Vercel Project Settings -> Environment Variables (Production), then redeploy - the fix does not take effect until a new deployment is built.`
    );
    return null;
  }
  return explicit.replace(/\/+$/, "");
}

// Resolves the absolute base URL to use for links inside server-sent
// notifications (SMS/email), where a relative path won't work. Prefers an
// explicit override so links point at the real custom domain rather than a
// Vercel preview/production hostname - these links should always point at
// the real production site no matter which environment sent them (see
// getAuthRedirectBaseUrl() below for why that one differs).
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    const sanitized = sanitizeExplicitSiteUrl(explicit, "getSiteUrl");
    if (sanitized) return sanitized;
  }
  // Reached with no usable explicit value - either it was never set, or
  // it was set to something rejected above (e.g. the retired domain).
  // Both cases fall through to the same safety net below.

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  // The Winsalot Growth CRM (winsalot-funding project) always has a real
  // custom domain in production - falling back to its own ambiguous
  // *.vercel.app deployment URL here would be exactly the same class of
  // bug as the retired-domain case above, just a different wrong host.
  // Use the real canonical domain directly instead. The Lead Gen CRM
  // (winsalot-leadgen-crm) has no equivalent canonical fallback of its
  // own, so it keeps using its deployment URL as before.
  if (vercelUrl && isGrowthCrmHost(vercelUrl)) {
    console.warn(`[getSiteUrl] No usable NEXT_PUBLIC_SITE_URL - using ${GROWTH_CRM_CANONICAL_SITE_URL} instead of the ambiguous ${vercelUrl}.`);
    return GROWTH_CRM_CANONICAL_SITE_URL;
  }
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

// Resolves the base URL specifically for Supabase Auth email redirects
// (agent invite / forgot-password links). Deliberately different from
// getSiteUrl() above: those notification links should always point at the
// real production site no matter which environment sent them, but an auth
// redirect has to land back on the *same* deployment that issued the
// email, so a preview invite must redirect to that preview's own URL, not
// jump to production - so, unlike getSiteUrl() above, this never
// substitutes the canonical Growth CRM domain for an unset value, only
// rejects the retired domain if NEXT_PUBLIC_SITE_URL explicitly points at
// it.
//
// NEXT_PUBLIC_SITE_URL should only be set on the Production environment in
// Vercel (Project Settings -> Environment Variables, scoped to
// Production only) - exactly https://growth.winsalotcorp.com, never the
// retired https://cleaning.winsalotcorp.com (see src/lib/hosts.ts). A stale
// value here is the single root cause behind every consultation-booking
// email link - the CRM "Open in CRM" link and the prospect-facing
// reschedule/cancel links alike - pointing at the wrong domain, since both
// getSiteUrl() below and this function read this same env var. Left unset
// on Preview, so this falls through to VERCEL_URL, which Vercel sets
// automatically to the current preview deployment's own hostname.
export function getAuthRedirectBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    const sanitized = sanitizeExplicitSiteUrl(explicit, "getAuthRedirectBaseUrl");
    if (sanitized) return sanitized;
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}

// Expands a stored relative path (e.g. a leadgen client's booking_link
// pointing at this CRM's own built-in "/book/<slug>" page - see Mantra
// Collab's seeded client row) to a full absolute URL using this
// deployment's own site URL, so it works correctly in an email opened
// outside the app. Every other client's booking_link today is already
// an absolute external URL (e.g. Calendly) and passes through completely
// unchanged - this only ever matters for a link deliberately stored as
// a same-app relative path.
export function resolveSiteRelativeUrl(link: string | null): string | null {
  if (!link) return null;
  return link.startsWith("/") ? `${getSiteUrl()}${link}` : link;
}
