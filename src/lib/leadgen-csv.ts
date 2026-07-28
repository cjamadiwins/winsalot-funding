// Dependency-free CSV parser for the "Upload Leads by CSV" admin action.
// Handles the common RFC4180 cases a real spreadsheet export produces
// (quoted fields, embedded commas/newlines/escaped quotes) without
// pulling in a new npm dependency for what's fundamentally a small,
// well-scoped need.

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings up front so \r\n and \r alone behave the same
  // as \n inside the state machine below.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Final field/row, if the file doesn't end with a trailing newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

const COLUMN_ALIASES: Record<string, string> = {
  business_name: "business_name",
  business: "business_name",
  company: "business_name",
  company_name: "business_name",
  industry: "industry",
  contact_name: "contact_name",
  contact: "contact_name",
  decision_maker_name: "decision_maker_name",
  decision_maker: "decision_maker_name",
  owner: "decision_maker_name",
  owner_name: "decision_maker_name",
  phone: "phone",
  phone_number: "phone",
  email: "email",
  website: "website",
  city: "city",
  province: "province",
  state: "province",
  lead_source: "lead_source",
  source: "lead_source",
  notes: "notes",
};

export type ParsedLeadCsvRow = {
  business_name: string;
  industry?: string;
  contact_name?: string;
  decision_maker_name?: string;
  phone?: string;
  email?: string;
  website?: string;
  city?: string;
  province?: string;
  lead_source?: string;
  notes?: string;
};

export function parseLeadsCsv(text: string): { rows: ParsedLeadCsvRow[]; errors: string[] } {
  const rawRows = parseCsvRows(text);
  const errors: string[] = [];

  if (rawRows.length === 0) {
    return { rows: [], errors: ["The file is empty."] };
  }

  const headerRow = rawRows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const fieldByColumnIndex = headerRow.map((h) => COLUMN_ALIASES[h] ?? null);

  if (!fieldByColumnIndex.includes("business_name")) {
    return {
      rows: [],
      errors: [
        'No "Business Name" column found. Expected a header like "Business Name" or "Company" (case-insensitive).',
      ],
    };
  }

  const rows: ParsedLeadCsvRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (raw.every((v) => v.trim() === "")) continue;

    const record: Record<string, string> = {};
    fieldByColumnIndex.forEach((field, colIndex) => {
      if (!field) return;
      const value = (raw[colIndex] ?? "").trim();
      if (value) record[field] = value;
    });

    if (!record.business_name) {
      errors.push(`Row ${i + 1}: missing a business name, skipped.`);
      continue;
    }

    rows.push(record as ParsedLeadCsvRow);
  }

  return { rows, errors };
}
