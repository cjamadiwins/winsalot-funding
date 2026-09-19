// Header-guessing for the Call List Segments upload flow. Deliberately
// has no "server-only" import - both the server action that builds the
// initial suggested mapping and the client-side Map Columns step can use
// it directly, since it's pure string logic with no secrets.
//
// Every uploaded column that doesn't map to one of these fixed fields is
// kept, not discarded - see call_list_leads.extra_fields - so a LeadSwift
// export with unexpected extra columns is never silently truncated.
export const CALL_LIST_TARGET_FIELDS = [
  "business_name",
  "contact_name",
  "phone",
  "email",
  "website",
  "city",
  "province",
  "industry",
  "notes",
] as const;

export type CallListTargetField = (typeof CALL_LIST_TARGET_FIELDS)[number];

export const CALL_LIST_TARGET_FIELD_LABELS: Record<CallListTargetField, string> = {
  business_name: "Business Name",
  contact_name: "Contact Name",
  phone: "Phone",
  email: "Email",
  website: "Website",
  city: "City",
  province: "Province",
  industry: "Industry",
  notes: "Notes",
};

// The Map Columns step only ever requires this one field - business_name
// is the only column a call_list_leads row can't do without (it's `not
// null`); everything else, including phone, may be blank for a given row
// (duplicate matching just falls back to business name).
export const CALL_LIST_REQUIRED_FIELDS: CallListTargetField[] = ["business_name"];

// Every synonym list below is deliberately generous - LeadSwift and other
// scraper/export tools vary their column names a lot, and the brief's own
// bug report ("Couldn't find a Business Name column") turned out to be
// caused by a bare "Name" header: it matched contact_name's old synonym
// list (which included plain "name") and got claimed before business_name
// - which didn't include "name" at all - ever got a chance to look at it,
// since guessColumnMapping processes fields in CALL_LIST_TARGET_FIELDS
// order and marks a header "used" once any field claims it. Fixed here by
// (a) adding "name"/"organisation"/etc. to business_name - a plain "Name"
// column on a business-listing export overwhelmingly means the business's
// name, not a person's - and (b) requiring contact_name's own synonyms to
// be reasonably specific (never bare "name") so it can no longer win that
// race.
const SYNONYMS: Record<CallListTargetField, string[]> = {
  business_name: [
    "business name",
    "business",
    "biz name",
    "biz",
    "company",
    "company name",
    "organization",
    "organisation",
    "org",
    "name",
    "listing name",
    "listing",
  ],
  contact_name: [
    "contact name",
    "contact",
    "contact person",
    "decision maker",
    "decision maker name",
    "owner name",
    "owner",
    "full name",
    "primary contact",
  ],
  phone: [
    "phone",
    "phone number",
    "telephone",
    "tel",
    "mobile",
    "cell",
    "cell phone",
    "business phone",
    "contact phone",
    "office phone",
    "work phone",
    "primary phone",
  ],
  email: ["email", "email address", "e mail", "business email", "contact email", "primary email"],
  website: ["website", "web site", "url", "site", "web", "web address", "domain", "homepage"],
  city: ["city", "town", "municipality"],
  province: ["province", "state", "province state", "province/state", "state province", "region"],
  industry: ["industry", "category", "sector", "niche", "vertical", "business category", "business type", "type"],
  notes: ["notes", "note", "comments", "comment", "description"],
};

// Detected and offered as a synthetic "combined" option for contact_name
// when a file (like most LeadSwift exports) has separate First/Last Name
// columns instead of one combined name column. Encoded as a plain string
// (COMBINE_PREFIX + the two real header names, "|"-joined) rather than a
// richer type so it fits into the exact same `string | null` mapping
// shape as every other field - buildMappableHeaders/applyColumnMapping/
// describeHeaderOption are the only three places that need to know this
// encoding exists.
const COMBINE_PREFIX = "__combine__:";
const FIRST_NAME_SYNONYMS = ["first name", "firstname", "fname", "given name"];
const LAST_NAME_SYNONYMS = ["last name", "lastname", "lname", "surname", "family name"];

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ");
}

function detectFirstLastNameHeaders(headers: string[]): [string, string] | null {
  const first = headers.find((h) => FIRST_NAME_SYNONYMS.includes(normalizeHeader(h)));
  const last = headers.find((h) => LAST_NAME_SYNONYMS.includes(normalizeHeader(h)));
  return first && last ? [first, last] : null;
}

// The full list of choices the Map Columns step's dropdowns should offer
// for a given uploaded file - every real header, plus a synthesized
// "First Name + Last Name" combined option when both exist and no single
// contact-name-ish column already does the job.
export function buildMappableHeaders(headers: string[]): string[] {
  const combo = detectFirstLastNameHeaders(headers);
  if (!combo) return headers;
  return [...headers, `${COMBINE_PREFIX}${combo[0]}|${combo[1]}`];
}

// Human-readable label for one entry from buildMappableHeaders - real
// headers are shown as-is, the synthesized combine option gets a plain-
// English description.
export function describeHeaderOption(header: string): string {
  if (header.startsWith(COMBINE_PREFIX)) {
    const [first, last] = header.slice(COMBINE_PREFIX.length).split("|");
    return `${first} + ${last} (combined)`;
  }
  return header;
}

// Best-effort guess only - always shown to the Admin in the Map Columns
// step for confirmation/correction before the file is imported, never
// applied silently. Pass the result of buildMappableHeaders(), not the
// raw file headers, so the synthesized First+Last combo can be suggested
// for contact_name when there's no single better match.
export function guessColumnMapping(mappableHeaders: string[]): Record<CallListTargetField, string | null> {
  const candidates = mappableHeaders.map((header) => ({
    raw: header,
    norm: header.startsWith(COMBINE_PREFIX) ? "" : normalizeHeader(header),
  }));
  const used = new Set<string>();
  const mapping = {} as Record<CallListTargetField, string | null>;

  for (const field of CALL_LIST_TARGET_FIELDS) {
    const synonyms = SYNONYMS[field];
    const match = candidates.find((h) => !used.has(h.raw) && synonyms.includes(h.norm));
    mapping[field] = match ? match.raw : null;
    if (match) used.add(match.raw);
  }

  // Fall back to the synthesized First+Last combo for contact_name if
  // nothing else claimed it and the file actually has both columns.
  if (!mapping.contact_name) {
    const combo = mappableHeaders.find((h) => h.startsWith(COMBINE_PREFIX) && !used.has(h));
    if (combo) mapping.contact_name = combo;
  }

  return mapping;
}

export type MappedLeadRow = {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  website: string;
  city: string;
  province: string;
  industry: string;
  notes: string;
  extra_fields: Record<string, string>;
};

// Applies a confirmed header mapping (values are entries from
// buildMappableHeaders - a real header, or a "__combine__:First|Last"
// synthetic one) to one parsed data row: fixed fields go to their own
// column, every other real header (unmapped, or a duplicate header name
// the admin didn't pick) is preserved verbatim in extra_fields so nothing
// from the original file is ever lost.
export function applyColumnMapping(headers: string[], row: string[], mapping: Partial<Record<CallListTargetField, string | null>>): MappedLeadRow {
  const valueByHeader = new Map(headers.map((header, i) => [header, row[i] ?? ""]));

  function resolve(headerRef: string | null | undefined): string {
    if (!headerRef) return "";
    if (headerRef.startsWith(COMBINE_PREFIX)) {
      const [first, last] = headerRef.slice(COMBINE_PREFIX.length).split("|");
      return [valueByHeader.get(first), valueByHeader.get(last)]
        .filter((v): v is string => !!v && v.trim().length > 0)
        .join(" ")
        .trim();
    }
    return (valueByHeader.get(headerRef) ?? "").trim();
  }

  const result = {} as MappedLeadRow;
  for (const field of CALL_LIST_TARGET_FIELDS) {
    result[field] = resolve(mapping[field]);
  }

  const mappedHeaders = new Set<string>();
  for (const headerRef of Object.values(mapping)) {
    if (!headerRef) continue;
    if (headerRef.startsWith(COMBINE_PREFIX)) {
      const [first, last] = headerRef.slice(COMBINE_PREFIX.length).split("|");
      mappedHeaders.add(first);
      mappedHeaders.add(last);
    } else {
      mappedHeaders.add(headerRef);
    }
  }

  const extra_fields: Record<string, string> = {};
  for (const header of headers) {
    if (mappedHeaders.has(header)) continue;
    const value = (valueByHeader.get(header) ?? "").trim();
    if (value) extra_fields[header] = value;
  }
  result.extra_fields = extra_fields;

  return result;
}
