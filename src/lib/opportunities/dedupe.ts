type DedupeFields = {
  organization_name?: string | null;
  opportunity_title: string;
  source_url: string;
  deadline?: string | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Per the brief: "Avoid duplicate records by comparing organization name,
// opportunity title, source URL, and deadline." Two records are the same
// opportunity if they share a source URL + title (the common case - the
// same listing re-crawled the next day), or if they share org + title +
// deadline even from a slightly different URL (e.g. a listing re-published
// with a tracking parameter, or mirrored on a second portal).
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
  return false;
}

// Collapses duplicates within a single run's candidate list (e.g. the same
// tender appearing in two connectors' results), keeping the first
// occurrence. Checking against already-persisted rows happens separately
// in run.ts, since that requires a database round trip.
export function dedupeCandidates<T extends DedupeFields>(candidates: T[]): T[] {
  const kept: T[] = [];
  for (const candidate of candidates) {
    if (!kept.some((existing) => isDuplicateOpportunity(existing, candidate))) {
      kept.push(candidate);
    }
  }
  return kept;
}
