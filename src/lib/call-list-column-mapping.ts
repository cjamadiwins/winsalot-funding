// Header-guessing for the Call List Segments upload flow. Deliberately
// has no "server-only" import - both the server action that builds the
// initial suggested mapping and (if ever needed) a client-side preview
// can use it directly, since it's pure string logic with no secrets.
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

// business_name is the only field a call_list_leads row can't do without
// (it's `not null`) - everything else, including phone, may be blank for
// a given row (duplicate matching just falls back to business name).
export const CALL_LIST_REQUIRED_FIELDS: CallListTargetField[] = ["business_name"];

const SYNONYMS: Record<CallListTargetField, string[]> = {
  business_name: ["business name", "business", "company", "company name", "organization", "org"],
  contact_name: ["contact name", "contact", "name", "decision maker", "decision maker name", "owner name", "owner"],
  phone: ["phone", "phone number", "telephone", "tel", "mobile", "cell", "cell phone"],
  email: ["email", "email address", "e mail"],
  website: ["website", "web site", "url", "site", "web"],
  city: ["city", "town"],
  province: ["province", "state", "province state", "province/state", "region"],
  industry: ["industry", "category", "sector", "niche", "vertical"],
  notes: ["notes", "note", "comments", "comment", "description"],
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ");
}

// Best-effort guess only - always shown to the Admin for confirmation/
// correction before the file is imported, never applied silently.
export function guessColumnMapping(headers: string[]): Record<CallListTargetField, string | null> {
  const normalizedHeaders = headers.map((header) => ({ raw: header, norm: normalizeHeader(header) }));
  const used = new Set<string>();
  const mapping = {} as Record<CallListTargetField, string | null>;

  for (const field of CALL_LIST_TARGET_FIELDS) {
    const synonyms = SYNONYMS[field];
    const match = normalizedHeaders.find((h) => !used.has(h.raw) && synonyms.includes(h.norm));
    mapping[field] = match ? match.raw : null;
    if (match) used.add(match.raw);
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

// Applies a confirmed header mapping to one parsed data row: fixed
// fields go to their own column, every other header (unmapped, or a
// duplicate header name the admin didn't pick) is preserved verbatim in
// extra_fields so nothing from the original file is ever lost.
export function applyColumnMapping(headers: string[], row: string[], mapping: Partial<Record<CallListTargetField, string>>): MappedLeadRow {
  const valueByHeader = new Map(headers.map((header, i) => [header, row[i] ?? ""]));
  const mappedHeaders = new Set(Object.values(mapping).filter((h): h is string => !!h));

  const result = {} as MappedLeadRow;
  for (const field of CALL_LIST_TARGET_FIELDS) {
    const header = mapping[field];
    result[field] = header ? (valueByHeader.get(header) ?? "").trim() : "";
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
