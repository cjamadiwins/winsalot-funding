type DedupeFields = {
  organization_name?: string | null;
  opportunity_title: string;
  source_url: string;
  deadline?: string | null;
  public_phone?: string | null;
  website?: string | null;
  address?: string | null;
  osm_id?: string | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// Per the brief: "Avoid duplicate records by comparing organization name,
// opportunity title, source URL, and deadline" (tenders), plus, for
// Qualified Prospects, "prevent duplicates using business name, phone
// number, website, address, and OpenStreetMap ID." Two records are the
// same opportunity if:
//  - they share a source URL + title (the common case - the same listing
//    re-crawled the next day), or
//  - they share org + title + deadline even from a slightly different URL
//    (e.g. a listing re-published with a tracking parameter), or
//  - they share the exact same OpenStreetMap element id (the strongest
//    possible identity for a prospect - the same real-world business
//    record, even if its name, phone, or source_url changed since we last
//    saw it), or
//  - they share an organization name plus at least one matching
//    phone/website/address (a prospect re-appearing under a slightly
//    different source_url, since sourceUrlFor() embeds the OSM element
//    type/id which can occasionally change if the underlying OSM data is
//    edited between runs).
export function isDuplicateOpportunity(a: DedupeFields, b: DedupeFields): boolean {
  if (normalize(a.source_url) === normalize(b.source_url) && normalize(a.opportunity_title) === normalize(b.opportunity_title)) {
    return true;
  }
  if (
    a.organization_name &&
    b.organization_name &&
    normalize(a.organization_name) === normalize(b.organization_name) &&
    normalize(a.opportunity_title) === normalize(b.opportunity_title) &&
    (a.deadline ?? null) === (b.deadline ?? null)
  ) {
    return true;
  }
  if (a.osm_id && b.osm_id && a.osm_id === b.osm_id) {
    return true;
  }
  if (a.organization_name && b.organization_name && normalize(a.organization_name) === normalize(b.organization_name)) {
    const phoneMatch = Boolean(a.public_phone) && Boolean(b.public_phone) && normalizePhone(a.public_phone) === normalizePhone(b.public_phone);
    const websiteMatch = Boolean(a.website) && Boolean(b.website) && normalize(a.website) === normalize(b.website);
    const addressMatch = Boolean(a.address) && Boolean(b.address) && normalize(a.address) === normalize(b.address);
    if (phoneMatch || websiteMatch || addressMatch) return true;
  }
  return false;
}

// Collapses duplicates within a single run's candidate list (e.g. the same
// business appearing in two overlapping city/industry queries), keeping
// the first occurrence. Checking against already-persisted rows happens
// separately in run.ts, since that requires a database round trip.
export function dedupeCandidates<T extends DedupeFields>(candidates: T[]): T[] {
  const kept: T[] = [];
  for (const candidate of candidates) {
    if (!kept.some((existing) => isDuplicateOpportunity(existing, candidate))) {
      kept.push(candidate);
    }
  }
  return kept;
}
