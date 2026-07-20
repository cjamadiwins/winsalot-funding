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
