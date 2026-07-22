import "server-only";
import { lookupCity } from "../cities";
import { INDUSTRY_OSM_MAPPINGS, PROSPECT_REGIONS } from "../industries";
import type { ConnectorResult, OpportunityCandidate, RejectedCandidate } from "../types";

// OpenStreetMap's Overpass API: a free, public, no-API-key business/POI
// directory covering the target industries reasonably well via its tag
// scheme (amenity=clinic, shop=car, leisure=fitness_centre, etc.) -
// explicitly intended for this kind of programmatic query under OSM's own
// usage policy (https://operations.osmfoundation.org/policies/api/), not
// a scraped page. Unverified against a live fetch (this sandbox has no
// outbound network access - see docs/active-cleaning-opportunities.md)
// but built conservatively: one query per (region, industry) pair, run
// sequentially with a delay between calls rather than in parallel, out of
// respect for the shared public instance's fair-use expectations, plus an
// overall time budget so a slow run doesn't blow past the cron route's
// function timeout.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SOURCE_NAME = "OpenStreetMap (Overpass API)";
const FETCH_TIMEOUT_MS = 25_000;
const MAX_CANDIDATES = 200;
const MAX_REJECTED_SAMPLES = 30;
// Kept well under the cron route's 60s maxDuration - this runs
// concurrently with the tender connectors (Promise.all in run.ts), but
// the DB dedupe/insert/expire-sweep/email work after all four finish
// still needs its own margin.
const CONNECTOR_TIME_BUDGET_MS = 30_000;
const DELAY_BETWEEN_QUERIES_MS = 1_000;

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
};

function buildQuery(bbox: string, filters: string[]): string {
  const clauses = filters.flatMap((filter) => [`node${filter}(${bbox});`, `way${filter}(${bbox});`]);
  return `[out:json][timeout:25];\n(\n${clauses.join("\n")}\n);\nout center tags;`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "WinsalotOpportunityBot/1.0 (+mailto:info@winsalotcorp.com)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) {
      throw new Error(`Overpass API returned HTTP ${response.status}`);
    }
    const json = (await response.json()) as { elements?: OverpassElement[] };
    return json.elements ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

function sourceUrlFor(element: OverpassElement): string {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

export async function runQualifiedProspectsConnector(): Promise<ConnectorResult> {
  const candidates: OpportunityCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  let rejectedCount = 0;
  const seenElementKeys = new Set<string>();
  const startedAt = Date.now();
  const errors: string[] = [];

  regionLoop: for (const region of PROSPECT_REGIONS) {
    for (const mapping of INDUSTRY_OSM_MAPPINGS) {
      if (candidates.length >= MAX_CANDIDATES) break regionLoop;
      if (Date.now() - startedAt > CONNECTOR_TIME_BUDGET_MS) break regionLoop;

      let elements: OverpassElement[];
      try {
        elements = await fetchOverpass(buildQuery(region.bbox, mapping.filters));
      } catch (error) {
        errors.push(
          `${mapping.industry} in ${region.name}: ${error instanceof Error ? error.message : "unknown error"}`
        );
        await sleep(DELAY_BETWEEN_QUERIES_MS);
        continue;
      }

      for (const element of elements) {
        if (candidates.length >= MAX_CANDIDATES) break;

        const key = `${element.type}/${element.id}`;
        if (seenElementKeys.has(key)) continue;
        seenElementKeys.add(key);

        const tags = element.tags ?? {};
        const name = tags.name?.trim();
        if (!name) continue; // no usable business identity - not a candidate at all

        // City comes only from the structured addr:city tag - never
        // guessed from the bounding-box region alone (the bbox is just a
        // query-size limiter; plenty of POIs inside it will be outside
        // every actual target city, e.g. small towns between Toronto and
        // Oshawa). Same "prefer the structured field, mark it excluded
        // rather than guess" rule as the CanadaBuys connector.
        const addrCity = tags["addr:city"];
        const city = lookupCity(addrCity);
        if (!city) {
          rejectedCount += 1;
          if (rejected.length < MAX_REJECTED_SAMPLES) {
            rejected.push({
              opportunity_title: name,
              source_name: SOURCE_NAME,
              source_url: sourceUrlFor(element),
              reason: `No confirmed Metro Vancouver/GTA city on record (addr:city = "${addrCity ?? "none"}") - not guessed.`,
            });
          }
          continue;
        }

        const phone = tags.phone || tags["contact:phone"] || null;
        const email = tags.email || tags["contact:email"] || null;
        const website = tags.website || tags["contact:website"] || null;

        // Prospects can never be Hot (see scoring.ts), so unlike an
        // Active Opportunity, a prospect with no public contact method at
        // all is never worth keeping - there's no confirmed intent to
        // offset the missing contact info.
        if (!phone && !email) {
          rejectedCount += 1;
          if (rejected.length < MAX_REJECTED_SAMPLES) {
            rejected.push({
              opportunity_title: name,
              source_name: SOURCE_NAME,
              source_url: sourceUrlFor(element),
              reason: "No public phone or email on record - excluded (prospects require a usable contact method).",
            });
          }
          continue;
        }

        const contactDescription = phone && email ? "phone number and email" : phone ? "phone number" : "email";

        candidates.push({
          lead_category: "Qualified Prospect",
          organization_name: name,
          opportunity_title: name,
          description: `Qualified prospect in the ${mapping.industry} industry - a strong fit for commercial cleaning outreach based on its business category.`,
          opportunity_type: "qualified_prospect",
          service_needed: null,
          industry: mapping.industry,
          city: city.name,
          province: city.province,
          public_email: email,
          public_phone: phone,
          website,
          source_name: SOURCE_NAME,
          source_url: sourceUrlFor(element),
          matched_cleaning_terms: [],
          accepted_reason: `${mapping.industry} business with a confirmed ${city.name} address and a public ${contactDescription} - fits the commercial-cleaning target profile.`,
        });
      }

      await sleep(DELAY_BETWEEN_QUERIES_MS);
    }
  }

  return {
    source_name: SOURCE_NAME,
    candidates,
    rejectedCount,
    rejected,
    error: errors.length > 0 ? errors.slice(0, 5).join("; ") : undefined,
  };
}
