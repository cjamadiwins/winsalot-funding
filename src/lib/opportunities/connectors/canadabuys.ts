import "server-only";
import { findColumn, parseCsv } from "../csv";
import { lookupCity, TARGET_CITIES } from "../cities";
import { classifyOpportunityType, matchesCleaningIntent } from "../keywords";
import type { ConnectorResult, OpportunityCandidate } from "../types";

// CanadaBuys' official open-data feed: a bilingual CSV of every current
// Government of Canada tender notice, republished under the Open
// Government Licence and updated every two hours. This is a published
// bulk-data file, not a crawled page, so it doesn't need the robots.txt
// gate the HTML connectors use - it's explicitly meant for automated
// consumption. See https://open.canada.ca/data/en/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2.
const FEED_URL = "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv";
const SOURCE_NAME = "CanadaBuys (Government of Canada Open Data)";
const FETCH_TIMEOUT_MS = 30_000;
const MAX_CANDIDATES = 250;

function toIsoDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function cell(row: string[], idx: number): string | undefined {
  if (idx === -1) return undefined;
  const value = row[idx]?.trim();
  return value ? value : undefined;
}

export async function runCanadaBuysConnector(): Promise<ConnectorResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(FEED_URL, {
        signal: controller.signal,
        headers: { "User-Agent": "WinsalotOpportunityBot/1.0 (+mailto:info@winsalotcorp.com)" },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`CanadaBuys feed returned HTTP ${response.status}`);
    }

    const text = await response.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      throw new Error("CanadaBuys feed returned no data rows");
    }

    const headers = rows[0];
    const titleIdx = findColumn(headers, ["title"]);
    const noticeUrlIdx = findColumn(headers, ["noticeurl", "url"]);

    if (titleIdx === -1 || noticeUrlIdx === -1) {
      throw new Error("CanadaBuys feed schema has changed - expected title/URL columns not found");
    }

    const descriptionIdx = findColumn(headers, ["tenderdescription", "description"]);
    const entityNameIdx = findColumn(headers, ["contractingentityname", "entityname", "organizationname"]);
    const entityCityIdx = findColumn(headers, ["contractingentitycity", "entitycity"]);
    const publicationDateIdx = findColumn(headers, ["publicationdate"]);
    const closingDateIdx = findColumn(headers, ["tenderclosingdate", "closingdate"]);
    const contactNameIdx = findColumn(headers, ["contactinfoname", "contactname"]);
    const contactEmailIdx = findColumn(headers, ["contactinfoemail", "contactemail"]);
    const contactPhoneIdx = findColumn(headers, ["contactinfophone", "contactphone"]);
    const categoryIdx = findColumn(headers, ["gsindescription", "unspscdescription", "category"]);

    const candidates: OpportunityCandidate[] = [];

    for (let i = 1; i < rows.length && candidates.length < MAX_CANDIDATES; i++) {
      const row = rows[i];
      const title = cell(row, titleIdx);
      const noticeUrl = cell(row, noticeUrlIdx);
      if (!title || !noticeUrl) continue;

      const description = cell(row, descriptionIdx);
      const category = cell(row, categoryIdx);
      const combinedText = [title, description, category].filter(Boolean).join(" ");
      if (!matchesCleaningIntent(combinedText)) continue;

      // Filter to Metro Vancouver / GTA target markets - search the entity
      // city column first, then fall back to scanning the title/description
      // for a target city name (the "entity" city is the buyer's own
      // office, which for a Crown corporation or regional buyer may differ
      // from the delivery location actually named in the notice text).
      const entityCity = cell(row, entityCityIdx);
      let city = lookupCity(entityCity);
      if (!city) {
        city = TARGET_CITIES.find((c) => combinedText.toLowerCase().includes(c.name.toLowerCase())) ?? null;
      }
      if (!city) continue;

      candidates.push({
        organization_name: cell(row, entityNameIdx) ?? null,
        opportunity_title: title,
        description: description?.slice(0, 2000) ?? null,
        opportunity_type: "rfp_tender",
        service_needed: category ?? classifyOpportunityType(combinedText),
        city: city.name,
        province: city.province,
        contact_name: cell(row, contactNameIdx) ?? null,
        public_email: cell(row, contactEmailIdx) ?? null,
        public_phone: cell(row, contactPhoneIdx) ?? null,
        website: noticeUrl,
        source_name: SOURCE_NAME,
        source_url: noticeUrl,
        date_posted: toIsoDate(cell(row, publicationDateIdx)) ?? null,
        deadline: toIsoDate(cell(row, closingDateIdx)) ?? null,
      });
    }

    return { source_name: SOURCE_NAME, candidates };
  } catch (error) {
    return {
      source_name: SOURCE_NAME,
      candidates: [],
      error: error instanceof Error ? error.message : "Unknown CanadaBuys connector error",
    };
  }
}
