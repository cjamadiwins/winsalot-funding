// Strict content filter added after the first live run imported two
// government facilities/janitorial tenders that either buried cleaning as
// one line item in a much broader facilities-maintenance scope, or were
// genuinely cleaning-specific but outside the project's target region. A
// generic tender/RFP/procurement/maintenance record is no longer enough
// on its own - a record must contain at least one of these
// strong, unambiguous cleaning-related phrases before it can be scored or
// saved at all.
export const STRONG_CLEANING_PHRASES = [
  "commercial cleaning",
  "janitorial services",
  "janitorial service",
  "custodial services",
  "custodial service",
  "office cleaning",
  "building cleaning",
  "facility cleaning",
  "housekeeping services",
  "cleaning contract",
  "cleaning services",
  "cleaning tender",
  "cleaning rfp",
  "cleaning quotation",
  "sanitation services",
  "washroom cleaning",
  "carpet cleaning",
  "floor cleaning",
  "window cleaning",
  "post-construction cleaning",
  "strata cleaning",
  "warehouse cleaning",
  "medical office cleaning",
  "school cleaning",
  "daycare cleaning",
  "restaurant cleaning",
  "industrial cleaning",
  "disinfection services",
  "porter services",
  "waste and cleaning services",
];

// None of these, alone, make a record cleaning-specific - they're exactly
// the generic procurement/facilities vocabulary that let the two bad
// records from the first run through the old single-keyword-list filter.
export const GENERIC_PROCUREMENT_TERMS = [
  "rfp",
  "tender",
  "procurement",
  "facilities",
  "construction",
  "maintenance",
  "property management",
  "government services",
  "building services",
  "vendor services",
];

// A record whose *title* is dominated by one of these is rejected unless
// a strong cleaning phrase also appears in the title itself - a strong
// phrase that only shows up buried in a long description (like
// "Janitorial Services" as one bullet among a dozen unrelated trades in a
// broad facilities-maintenance scope) isn't enough to call the whole
// record cleaning-specific.
export const EXCLUSION_TERMS = [
  "construction",
  "engineering",
  "architecture",
  "snow removal",
  "landscaping",
  "security",
  "pest control",
  "waste collection",
  "hvac",
  "plumbing",
  "electrical work",
  "roofing",
  "road maintenance",
  "equipment supply",
  "chemical supply",
  "staffing",
  "laundry",
  "food services",
  "moving services",
];

export const REQUEST_TERMS = [
  "request for proposal",
  "request for quote",
  "request for quotation",
  "rfp",
  "rfq",
  "bid",
  "tender",
  "quotation",
  "proposal",
];

export type CleaningRelevanceResult = {
  accepted: boolean;
  matchedTerms: string[];
  matchedInTitle: boolean;
  reason: string;
};

function findMatches(text: string, phrases: string[]): string[] {
  return phrases.filter((phrase) => text.includes(phrase));
}

// Evaluates title/description/category together, but title carries the
// deciding weight: a strong phrase anywhere earns a candidate slot, but a
// strong phrase that appears ONLY outside the title is overridden by an
// exclusion term found in the title (the title is the most reliable
// signal of what a tender is actually, primarily, for).
export function evaluateCleaningRelevance(fields: {
  title: string;
  description?: string | null;
  category?: string | null;
}): CleaningRelevanceResult {
  const title = (fields.title ?? "").toLowerCase();
  const description = (fields.description ?? "").toLowerCase();
  const category = (fields.category ?? "").toLowerCase();
  const combined = `${title} ${description} ${category}`;

  const matchedTerms = findMatches(combined, STRONG_CLEANING_PHRASES);

  if (matchedTerms.length === 0) {
    return {
      accepted: false,
      matchedTerms: [],
      matchedInTitle: false,
      reason: "No confirmed cleaning-specific phrase found in the title, description, or category.",
    };
  }

  const matchedInTitle = findMatches(title, STRONG_CLEANING_PHRASES).length > 0;
  if (matchedInTitle) {
    return {
      accepted: true,
      matchedTerms,
      matchedInTitle: true,
      reason: `Title contains a confirmed cleaning-specific phrase: "${matchedTerms[0]}".`,
    };
  }

  const titleExclusion = EXCLUSION_TERMS.find((term) => title.includes(term));
  if (titleExclusion) {
    return {
      accepted: false,
      matchedTerms,
      matchedInTitle: false,
      reason: `Title indicates a primary scope of "${titleExclusion}" - cleaning is only mentioned in the description/category, not accepted as cleaning-specific.`,
    };
  }

  // A generic title (no exclusion term of its own) can still describe a
  // broad multi-trade facilities scope where cleaning is just one line
  // item among many unrelated ones - e.g. a "Facilities Maintenance and
  // Support Services" tender whose description lists HVAC, plumbing,
  // landscaping, pest control, AND janitorial services together. Two or
  // more distinct exclusion terms in the body is treated as that signal;
  // one incidental mention (e.g. a single "security" reference) isn't
  // enough to override a genuine cleaning phrase on its own.
  const bodyExclusions = EXCLUSION_TERMS.filter((term) => description.includes(term) || category.includes(term));
  if (bodyExclusions.length >= 2) {
    return {
      accepted: false,
      matchedTerms,
      matchedInTitle: false,
      reason: `Multiple non-cleaning service categories (${bodyExclusions.join(", ")}) dominate the description alongside "${matchedTerms[0]}" - not primarily a cleaning-specific tender.`,
    };
  }

  return {
    accepted: true,
    matchedTerms,
    matchedInTitle: false,
    reason: `Description/category contains a confirmed cleaning-specific phrase: "${matchedTerms[0]}".`,
  };
}

export function hasExplicitRequestTerm(text: string | null | undefined): boolean {
  const lower = (text ?? "").toLowerCase();
  return REQUEST_TERMS.some((term) => lower.includes(term));
}
