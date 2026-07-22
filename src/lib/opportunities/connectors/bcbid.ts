import "server-only";
import { isAllowedByRobots, OPPORTUNITY_BOT_USER_AGENT } from "../robots";
import { extractDate, extractTableRows, resolveUrl } from "../html-scrape";
import { lookupCity } from "../cities";
import { evaluateCleaningRelevance } from "../cleaning-relevance";
import type { ConnectorResult, OpportunityCandidate, RejectedCandidate } from "../types";

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
const MAX_REJECTED_SAMPLES = 50;

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
    const rejected: RejectedCandidate[] = [];
    let rejectedCount = 0;

    for (const row of rows) {
      if (candidates.length >= MAX_CANDIDATES) break;

      const detailLink = row.links.find((link) => resolveUrl(LISTING_URL, link.href));
      if (!detailLink) continue;
      const sourceUrl = resolveUrl(LISTING_URL, detailLink.href);
      if (!sourceUrl) continue;
      const title = detailLink.text || row.text.slice(0, 140);

      const relevance = evaluateCleaningRelevance({ title, description: row.text });
      if (relevance.matchedTerms.length === 0) continue;

      if (!relevance.accepted) {
        rejectedCount += 1;
        if (rejected.length < MAX_REJECTED_SAMPLES) {
          rejected.push({ opportunity_title: title, source_name: SOURCE_NAME, source_url: sourceUrl, reason: relevance.reason });
        }
        continue;
      }

      // BC Bid's scraped listing rows have no separate location column
      // (see html-scrape.ts), so this is the one remaining text-scan-based
      // city inference in the codebase - lookupCity() is word-boundary
      // matched (not a raw substring check) to avoid the "parking"/
      // "seeking" false-matches-to-"King" bug the CanadaBuys connector
      // had, but it's still best-effort against freeform row text rather
      // than a structured location field. Flagged for tightening once
      // this connector's real markup is verified against a live fetch.
      const city = lookupCity(row.text);
      if (!city) {
        rejectedCount += 1;
        if (rejected.length < MAX_REJECTED_SAMPLES) {
          rejected.push({
            opportunity_title: title,
            source_name: SOURCE_NAME,
            source_url: sourceUrl,
            reason: "Cleaning-specific, but no confirmed Metro Vancouver/GTA location found in the listing text.",
          });
        }
        continue;
      }

      candidates.push({
        lead_category: "Active Opportunity",
        opportunity_title: title,
        description: row.text.slice(0, 2000),
        opportunity_type: "rfp_tender",
        city: city.name,
        province: city.province,
        source_name: SOURCE_NAME,
        source_url: sourceUrl,
        deadline: extractDate(row.text) ?? null,
        matched_cleaning_terms: relevance.matchedTerms,
        accepted_reason: relevance.reason,
      });
    }

    return { source_name: SOURCE_NAME, candidates, rejectedCount, rejected };
  } catch (error) {
    return {
      source_name: SOURCE_NAME,
      candidates: [],
      rejectedCount: 0,
      rejected: [],
      error: error instanceof Error ? error.message : "Unknown BC Bid connector error",
    };
  }
}
