import "server-only";
import { isAllowedByRobots, OPPORTUNITY_BOT_USER_AGENT } from "../robots";
import { extractDate, extractTableRows, resolveUrl } from "../html-scrape";
import { matchesCleaningIntent } from "../keywords";
import type { ConnectorResult, OpportunityCandidate, Province } from "../types";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_CANDIDATES_PER_PORTAL = 50;

export type MunicipalPortalConfig = {
  sourceName: string;
  listingUrl: string; // public bid/tender browse page, no login required
  city: string;
  province: Province;
};

// Generic connector for the many GTA/BC municipalities that run their
// public tender listings on a shared eProcurement platform (bids&tenders,
// Biddingo, and similar). One config entry = one municipality's public
// listing page; every entry is robots.txt-gated and wrapped so a broken
// or unreachable portal never blocks the others.
export async function runMunicipalPortalConnector(config: MunicipalPortalConfig): Promise<ConnectorResult> {
  try {
    const allowed = await isAllowedByRobots(config.listingUrl);
    if (!allowed) {
      throw new Error("robots.txt disallows fetching this page - skipped for compliance");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(config.listingUrl, {
        signal: controller.signal,
        headers: { "User-Agent": OPPORTUNITY_BOT_USER_AGENT },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`${config.sourceName} returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const rows = extractTableRows(html);
    const candidates: OpportunityCandidate[] = [];

    for (const row of rows) {
      if (candidates.length >= MAX_CANDIDATES_PER_PORTAL) break;
      if (!matchesCleaningIntent(row.text)) continue;

      const detailLink = row.links.find((link) => resolveUrl(config.listingUrl, link.href));
      if (!detailLink) continue;
      const sourceUrl = resolveUrl(config.listingUrl, detailLink.href);
      if (!sourceUrl) continue;

      candidates.push({
        opportunity_title: detailLink.text || row.text.slice(0, 140),
        description: row.text.slice(0, 2000),
        opportunity_type: "rfp_tender",
        city: config.city,
        province: config.province,
        source_name: config.sourceName,
        source_url: sourceUrl,
        deadline: extractDate(row.text) ?? null,
      });
    }

    return { source_name: config.sourceName, candidates };
  } catch (error) {
    return {
      source_name: config.sourceName,
      candidates: [],
      error: error instanceof Error ? error.message : `Unknown error for ${config.sourceName}`,
    };
  }
}

export async function runMunicipalPortals(configs: MunicipalPortalConfig[]): Promise<ConnectorResult[]> {
  return Promise.all(configs.map((config) => runMunicipalPortalConnector(config)));
}
