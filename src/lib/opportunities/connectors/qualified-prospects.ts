import "server-only";
import { bboxForCity, lookupCity } from "../cities";
import { todaysCityIndustryPairs } from "../rotation";
import type { ConnectorResult, OpportunityCandidate, RejectedCandidate } from "../types";

// OpenStreetMap's Overpass API: a free, public, no-API-key business/POI
// directory covering the target industries reasonably well via its tag
// scheme (amenity=clinic, shop=car, leisure=fitness_centre, etc.) -
// explicitly intended for this kind of programmatic query under OSM's own
// usage policy (https://operations.osmfoundation.org/policies/api/), not
// a scraped page. Unverified against a live fetch (this sandbox has no
// outbound network access - see docs/active-cleaning-opportunities.md)
// but built conservatively: one query per (city, industry) pair, drawn
// from a daily rotation (rotation.ts) so the same handful of cities isn't
// hit every single day, run sequentially with a delay between calls rather
// than in parallel, out of respect for the shared public instance's
// fair-use expectations, plus an overall time budget so a slow run doesn't
// blow past the cron route's function timeout.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SOURCE_NAME = "OpenStreetMap (Overpass API)";
const FETCH_TIMEOUT_MS = 25_000;
// "Target up to 50 new prospects per day" - caps how many raw candidates a
// single run will gather at all; dedup/DB-insert then determines how many
// of those are genuinely new (see run.ts). Never padded with invented
// records if fewer valid businesses turn up.
const MAX_CANDIDATES = 50;
const MAX_REJECTED_SAMPLES = 30;
// Kept well under the cron route's 60s maxDuration - this runs
// concurrently with the tender connectors (Promise.all in run.ts), but
// the DB dedupe/insert/expire-sweep/email work after all four finish
// still needs its own margin.
const CONNECTOR_TIME_BUDGET_MS = 30_000;
const DELAY_BETWEEN_QUERIES_MS = 1_000;
// A single city/industry query gets up to this many attempts (1 initial +
// 2 retries) before that pair is given up on for the run - covers HTTP 429
// (rate limited), 502/503/504 (the shared public instance is briefly
// overloaded), a client-side fetch timeout/abort, and any other network
// failure. A short, slightly-increasing delay between attempts (rather
// than hammering it again immediately) is the polite response to a 429 in
// particular, out of the same fair-use respect documented above.
const MAX_ATTEMPTS_PER_QUERY = 3;
const RETRY_DELAY_MS = [2_000, 4_000];

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

// Retries a single (city, industry) query up to MAX_ATTEMPTS_PER_QUERY
// times on any transient failure - a 429, a 5xx, a timed-out/aborted
// fetch, and a plain network error are all treated as "try again," since
// none of them mean the query itself is wrong (a malformed query would
// fail identically on every attempt and just cost a little extra time).
// The full error from every failed attempt is logged server-side
// (console.error, visible in Vercel's runtime logs) - only a sanitized,
// non-technical summary ever reaches the admin dashboard, built by the
// caller from the returned failure count, never from these raw messages.
async function fetchOverpassWithRetry(
  query: string,
  context: { cityName: string; industry: string },
  budget: { startedAt: number; timeBudgetMs: number }
): Promise<{ ok: true; elements: OverpassElement[] } | { ok: false }> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_QUERY; attempt++) {
    try {
      const elements = await fetchOverpass(query);
      return { ok: true, elements };
    } catch (error) {
      console.error(
        `[qualified-prospects] Overpass query failed (attempt ${attempt}/${MAX_ATTEMPTS_PER_QUERY}) for "${context.industry}" in ${context.cityName}:`,
        error
      );
      const isLastAttempt = attempt === MAX_ATTEMPTS_PER_QUERY;
      const overBudget = Date.now() - budget.startedAt > budget.timeBudgetMs;
      if (isLastAttempt || overBudget) {
        return { ok: false };
      }
      await sleep(RETRY_DELAY_MS[attempt - 1] ?? RETRY_DELAY_MS[RETRY_DELAY_MS.length - 1]);
    }
  }
  return { ok: false };
}

function sourceUrlFor(element: OverpassElement): string {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

function osmIdFor(element: OverpassElement): string {
  return `${element.type}/${element.id}`;
}

// Street address built only from structured addr:* tags - never geocoded
// or guessed from the city/bbox. Missing pieces are simply omitted rather
// than padded with placeholders.
function addressFor(tags: Record<string, string>): string | null {
  const streetLine = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ").trim();
  const parts = [streetLine, tags["addr:city"], tags["addr:province"] || tags["addr:state"], tags["addr:postcode"]].filter(
    (part): part is string => Boolean(part && part.trim().length > 0)
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

export type QualifiedProspectsResult = ConnectorResult & {
  citiesSearched: string[];
  industriesSearched: string[];
};

export async function runQualifiedProspectsConnector(): Promise<QualifiedProspectsResult> {
  const candidates: OpportunityCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  let rejectedCount = 0;
  const seenElementKeys = new Set<string>();
  const startedAt = Date.now();
  // Counts pairs that failed every attempt - the only thing that ever
  // reaches the admin-facing summary about a failure (see the sanitized
  // `error` message built below). No candidate or rejected-sample entry is
  // ever recorded for a failed pair, and nothing about it touches the
  // database - it's simply skipped, same as if that query had never run.
  let failedPairCount = 0;
  const citiesSearched = new Set<string>();
  const industriesSearched = new Set<string>();

  const pairs = todaysCityIndustryPairs();

  pairLoop: for (const pair of pairs) {
    if (candidates.length >= MAX_CANDIDATES) break pairLoop;
    if (Date.now() - startedAt > CONNECTOR_TIME_BUDGET_MS) break pairLoop;

    citiesSearched.add(pair.cityName);
    industriesSearched.add(pair.mapping.industry);

    const result = await fetchOverpassWithRetry(
      buildQuery(bboxForCity(pair.cityName), pair.mapping.filters),
      { cityName: pair.cityName, industry: pair.mapping.industry },
      { startedAt, timeBudgetMs: CONNECTOR_TIME_BUDGET_MS }
    );
    if (!result.ok) {
      failedPairCount += 1;
      await sleep(DELAY_BETWEEN_QUERIES_MS);
      continue;
    }
    const elements = result.elements;

    for (const element of elements) {
      if (candidates.length >= MAX_CANDIDATES) break;

      const key = osmIdFor(element);
      if (seenElementKeys.has(key)) continue;
      seenElementKeys.add(key);

      const tags = element.tags ?? {};
      const name = tags.name?.trim();
      if (!name) continue; // no usable business identity - not a candidate at all

      // City comes only from the structured addr:city tag - never guessed
      // from the query's target city or the bounding box alone (the bbox
      // is just a query-size limiter; plenty of POIs inside it belong to a
      // neighbouring non-target city). Same "prefer the structured field,
      // mark it excluded rather than guess" rule as the CanadaBuys
      // connector.
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
        description: `Qualified prospect in the ${pair.mapping.industry} industry - a strong fit for commercial cleaning outreach based on its business category.`,
        opportunity_type: "qualified_prospect",
        service_needed: null,
        industry: pair.mapping.industry,
        city: city.name,
        province: city.province,
        address: addressFor(tags),
        osm_id: key,
        public_email: email,
        public_phone: phone,
        website,
        source_name: SOURCE_NAME,
        source_url: sourceUrlFor(element),
        matched_cleaning_terms: [],
        accepted_reason: `${pair.mapping.industry} business with a confirmed ${city.name} address and a public ${contactDescription} - fits the commercial-cleaning target profile.`,
      });
    }

    await sleep(DELAY_BETWEEN_QUERIES_MS);
  }

  // Admin-facing message is deliberately generic - never the underlying
  // HTTP status, timeout, or network error text, which is only ever
  // written to the server-side log above (fetchOverpassWithRetry's
  // console.error calls). "Temporarily unavailable... tried again later"
  // is also literally true: tomorrow's rotation (rotation.ts) will query a
  // different slice of the city/industry matrix, but any of today's failed
  // pairs will come back around within the ~2-week full cycle regardless.
  const error =
    failedPairCount === 0
      ? undefined
      : failedPairCount === 1
        ? "This search was temporarily unavailable and can be tried again later."
        : `${failedPairCount} searches were temporarily unavailable and can be tried again later.`;

  return {
    source_name: SOURCE_NAME,
    candidates,
    rejectedCount,
    rejected,
    error,
    citiesSearched: Array.from(citiesSearched),
    industriesSearched: Array.from(industriesSearched),
  };
}
