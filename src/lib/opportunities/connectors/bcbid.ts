import "server-only";
import { isAllowedByRobots, OPPORTUNITY_BOT_USER_AGENT } from "../robots";
import { extractDate, extractTableRows, resolveUrl } from "../html-scrape";
import { lookupCity } from "../cities";
import { matchesCleaningIntent } from "../keywords";
import type { ConnectorResult, OpportunityCandidate } from "../types";

// BC Bid's public opportunity browse page - reachable without logging in.
// Confirmed as a real public URL, but this sandbox has no outbound network
// access to verify the live page's exact table markup (see
// docs/active-cleaning-opportunities.md) - the row-based parser in
// html-scrape.ts is intentionally tolerant of markup differences, but the
// selectors here should get a live smoke test after first deploy.
const SOURCE_NAME = "BC Bid (Province of British Columbia)";
const LISTING_URL = "https://bcbid.gov.bc.ca/page.aspx/en/rfp/request_browse_public";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_CANDIDATES = 100;

export async function runBcBidConnector(): Promise<ConnectorResult> {
  try {
    const allowed = await isAllowedByRobots(LISTING_URL);
    if (!allowed) {
      throw new Error("robots.txt disallows fetching this page - skipped for compliance");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(LISTING_URL, {
        signal: controller.signal,
        headers: { "User-Agent": OPPORTUNITY_BOT_USER_AGENT },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`BC Bid public listing returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const rows = extractTableRows(html);
    const candidates: OpportunityCandidate[] = [];

    for (const row of rows) {
      if (candidates.length >= MAX_CANDIDATES) break;
      if (!matchesCleaningIntent(row.text)) continue;

      const city = lookupCity(row.text);
      if (!city) continue;

      const detailLink = row.links.find((link) => resolveUrl(LISTING_URL, link.href));
      if (!detailLink) continue;
      const sourceUrl = resolveUrl(LISTING_URL, detailLink.href);
      if (!sourceUrl) continue;

      candidates.push({
        opportunity_title: detailLink.text || row.text.slice(0, 140),
        description: row.text.slice(0, 2000),
        opportunity_type: "rfp_tender",
        city: city.name,
        province: city.province,
        source_name: SOURCE_NAME,
        source_url: sourceUrl,
        deadline: extractDate(row.text) ?? null,
      });
    }

    return { source_name: SOURCE_NAME, candidates };
  } catch (error) {
    return {
      source_name: SOURCE_NAME,
      candidates: [],
      error: error instanceof Error ? error.message : "Unknown BC Bid connector error",
    };
  }
}
