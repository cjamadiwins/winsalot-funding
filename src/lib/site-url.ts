import "server-only";

// Resolves the absolute base URL to use for links inside server-sent
// notifications (SMS/email), where a relative path won't work. Prefers an
// explicit override so links point at the real custom domain rather than a
// Vercel preview/production hostname.
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

// Resolves the base URL specifically for Supabase Auth email redirects
// (agent invite / forgot-password links). Deliberately different from
// getSiteUrl() above: those notification links should always point at the
// real production site no matter which environment sent them, but an auth
// redirect has to land back on the *same* deployment that issued the
// email, so a preview invite must redirect to that preview's own URL, not
// jump to production.
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
  if (explicit) return explicit.replace(/\/+$/, "");

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
