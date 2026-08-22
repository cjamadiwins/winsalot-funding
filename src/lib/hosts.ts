// Hostnames this single Next.js deployment serves, keyed by which product
// each one belongs to. Shared between src/proxy.ts (routing) and any
// server code that needs to tell these apart at request time (e.g.
// restricting the Google Ads tag to the public cleaning site).
export const LEAD_GEN_HOSTS = new Set([
  "leads.winsalotcorp.com",
  "www.leads.winsalotcorp.com",
]);

export const CLEANING_QUOTE_HOSTS = new Set([
  "cleaning.winsalotcorp.com",
  "www.cleaning.winsalotcorp.com",
]);

// Which CRM a given request host belongs to. Both Vercel projects
// (winsalot-funding = Cleaning, winsalot-leadgen-crm = Lead Gen) deploy
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

export function isCleaningHost(host: string): boolean {
  return CLEANING_QUOTE_HOSTS.has(host) || host.startsWith("winsalot-funding");
}

// Distinct Supabase Auth cookie name per CRM, so a session for one can
// never be read, overwritten, or invalidated by the other - even if
// something (a proxy, a misconfigured domain) ever collapsed both apps
// onto what the browser sees as a single origin. Falls back to the
// Cleaning CRM's name for hosts that match neither set (local dev),
// where a single shared cookie name has no isolation implications since
// only one instance is ever running.
export function authCookieName(host: string): string {
  return isLeadGenHost(host) ? "sb-leadgen-auth" : "sb-cleaning-auth";
}
