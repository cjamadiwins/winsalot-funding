// Hostnames this single Next.js deployment serves, keyed by which product
// each one belongs to. Shared between src/proxy.ts (routing) and any
// server code that needs to tell these apart at request time (e.g.
// restricting the Google Ads tag to the public cleaning site).
export const LEAD_GEN_HOSTS = new Set([
  "leads.winsalotcorp.com",
  "www.leads.winsalotcorp.com",
]);

// Winsalot Growth CRM's hosts. growth.winsalotcorp.com is the canonical
// production domain - every base-URL/redirect reference in this app
// (NEXT_PUBLIC_SITE_URL, getSiteUrl()/getAuthRedirectBaseUrl() in
// site-url.ts, the Supabase Auth Site URL/Redirect URLs - see
// docs/crm.md's "Supabase dashboard settings to update") should point at
// it, never at cleaning.winsalotcorp.com. cleaning.winsalotcorp.com is
// kept in this Set only so this app still recognizes it as a Growth CRM
// host (never treating it as unrecognized/leadgen) if a request for it
// ever reaches this deployment directly - it is not meant to be reached
// that way in normal operation. The actual cleaning -> growth redirect is
// configured as a Vercel domain-level redirect (Project Settings ->
// Domains), entirely outside this app's own routing - this app's own
// proxy.ts/Server Actions never redirect a request to a *different* host
// than the one it arrived on (every redirect() call here targets a
// relative path, which inherits the incoming request's own origin).
// growth.winsalotcorp.com must NOT also have a "Redirect to" target
// configured in Vercel's Domains settings pointing back at
// cleaning.winsalotcorp.com - that combination is what produces
// ERR_TOO_MANY_REDIRECTS, entirely at Vercel's edge, before any request
// reaches this code.
export const GROWTH_CRM_HOSTS = new Set([
  "growth.winsalotcorp.com",
  "www.growth.winsalotcorp.com",
  "cleaning.winsalotcorp.com",
  "www.cleaning.winsalotcorp.com",
]);

// Which CRM a given request host belongs to. Both Vercel projects
// (winsalot-funding = Growth CRM, winsalot-leadgen-crm = Lead Gen) deploy
// this exact same codebase, so every Preview/Production deployment's own
// *.vercel.app hostname is always prefixed with that project's name -
// "winsalot-funding-..." or "winsalot-leadgen-..." - regardless of
// whether a custom domain is also attached. Checking that prefix (in
// addition to the known production custom domains above) means this
// works identically on production domains AND on every preview
// deployment, with no extra configuration.
export function isLeadGenHost(host: string): boolean {
  return LEAD_GEN_HOSTS.has(host) || host.startsWith("winsalot-leadgen");
}

export function isGrowthCrmHost(host: string): boolean {
  return GROWTH_CRM_HOSTS.has(host) || host.startsWith("winsalot-funding");
}

// Distinct Supabase Auth cookie name per CRM, so a session for one can
// never be read, overwritten, or invalidated by the other - even if
// something (a proxy, a misconfigured domain) ever collapsed both apps
// onto what the browser sees as a single origin. Falls back to the
// Growth CRM's name for hosts that match neither set (local dev), where
// a single shared cookie name has no isolation implications since only
// one instance is ever running. Deliberately still "sb-cleaning-auth",
// not renamed, so existing signed-in sessions on cleaning.winsalotcorp.com
// aren't invalidated by this rename.
export function authCookieName(host: string): string {
  return isLeadGenHost(host) ? "sb-leadgen-auth" : "sb-cleaning-auth";
}
