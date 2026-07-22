import "server-only";
import { runMunicipalPortals, type MunicipalPortalConfig } from "./municipal-portal";
import type { ConnectorResult } from "../types";

// Most GTA municipalities (and several BC ones) run their public tender
// listings on a shared eProcurement platform at a per-municipality
// subdomain, e.g. "<city>.bidsandtenders.ca". This sandbox has no outbound
// network access to confirm which target-city subdomains are real before
// shipping, and the compliance brief is explicit about not scraping
// without confirming public access - so this list intentionally ships
// EMPTY rather than guessing subdomains.
//
// To activate: visit each target municipality's own procurement/tenders
// page, find its public bid-listing URL (no login required), confirm
// robots.txt allows it (isAllowedByRobots() in ../robots.ts also enforces
// this automatically at runtime), and add an entry below. See
// docs/active-cleaning-opportunities.md for the verification checklist.
export const MUNICIPAL_PORTALS: MunicipalPortalConfig[] = [];

export async function runBidsAndTendersConnectors(): Promise<ConnectorResult[]> {
  if (MUNICIPAL_PORTALS.length === 0) return [];
  return runMunicipalPortals(MUNICIPAL_PORTALS);
}
