// Cleaning-intent terms from the brief, used two ways: (1) connectors that
// support server-side keyword search build queries by combining these with
// a target city, (2) every connector runs its raw candidates through
// matchesCleaningIntent() before keeping them, so a source that can't
// filter server-side (e.g. a bulk CSV feed) still only yields relevant rows.
export const CLEANING_KEYWORDS = [
  "commercial cleaning",
  "janitorial",
  "custodial",
  "office cleaning",
  "building cleaning",
  "building maintenance",
  "strata cleaning",
  "warehouse cleaning",
  "medical office cleaning",
  "dental office cleaning",
  "daycare cleaning",
  "school cleaning",
  "restaurant cleaning",
  "move-in cleaning",
  "post-construction cleaning",
  "cleaning services",
  "cleaning contract",
  "cleaning contractor",
  "condominium cleaning",
  "housekeeping services",
];

export function matchesCleaningIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CLEANING_KEYWORDS.some((keyword) => lower.includes(keyword));
}

// Rough signal words used to classify a matched record into an
// opportunity_type when a source doesn't already distinguish (e.g. a bulk
// tender feed is always 'rfp_tender', but a freeform listing needs this).
const HIRING_SIGNAL_WORDS = ["hiring", "now hiring", "job posting", "we're hiring", "vacancy", "vacancies"];
const NEW_LOCATION_WORDS = ["grand opening", "new location", "now open", "opening soon", "relocat"];
const QUOTE_REQUEST_WORDS = ["request for quote", "request for proposal", "rfq", "looking for quotes", "get a quote"];

export function classifyOpportunityType(text: string | null | undefined): "rfp_tender" | "quote_request" | "hiring_signal" | "new_location" | "other" {
  const lower = (text ?? "").toLowerCase();
  if (lower.includes("tender") || lower.includes("rfp") || lower.includes("request for proposal")) {
    return "rfp_tender";
  }
  if (QUOTE_REQUEST_WORDS.some((w) => lower.includes(w))) return "quote_request";
  if (HIRING_SIGNAL_WORDS.some((w) => lower.includes(w))) return "hiring_signal";
  if (NEW_LOCATION_WORDS.some((w) => lower.includes(w))) return "new_location";
  return "other";
}
