// Header-guessing for the Call List Segments connect flow. Deliberately
// has no "server-only" import - both the server action that builds the
// initial suggested mapping and (if ever needed) a client-side preview
// can use it directly, since it's pure string logic with no secrets.
export const CALL_LIST_TARGET_FIELDS = [
  "business_name",
  "contact_name",
  "phone",
  "email",
  "website",
  "city",
  "province",
  "industry",
  "source_notes",
] as const;

export type CallListTargetField = (typeof CALL_LIST_TARGET_FIELDS)[number];

export const CALL_LIST_TARGET_FIELD_LABELS: Record<CallListTargetField, string> = {
  business_name: "Business name",
  contact_name: "Contact name",
  phone: "Phone",
  email: "Email",
  website: "Website",
  city: "City",
  province: "Province / State",
  industry: "Industry",
  source_notes: "Source / list notes",
};

// Only business_name and phone are ever required by a CRM lead row - a
// segment can still be connected without a mapped email/website/etc, but
// at least one row-matching identifier (phone or business name) must be
// mappable or every sheet row from it would be unmatchable/undeduplicable.
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
  source_notes: ["source notes", "source list notes", "source/list notes", "list notes", "notes", "source"],
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ");
}

// Best-effort guess only - always shown to the Admin for confirmation/
// correction before a segment is created, never applied silently.
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
