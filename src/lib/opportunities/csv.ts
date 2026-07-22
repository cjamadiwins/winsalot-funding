// Builds an RFC4180 CSV string from rows of plain values - used by the
// admin dashboard's "Export CSV" button (client-side, no server round
// trip: it serializes whatever's currently loaded/filtered in the browser).
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header, ...rows].map((row) =>
    row.map((cell) => escapeCsvField(cell === null || cell === undefined ? "" : String(cell))).join(",")
  );
  return lines.join("\r\n");
}

// Minimal RFC4180-ish CSV parser (quoted fields, doubled-quote escaping,
// commas/newlines inside quotes) - not a dependency because the only
// current use is a single government open-data file and this is ~40 lines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// Finds the index of the first header whose (lowercased) text contains one
// of the given candidate substrings, tried in order. CanadaBuys' open-data
// headers are bilingual compounds (e.g. "title-titre"), so a substring
// match on the English term is resilient to exact-casing/ordering
// differences without hard-coding a full header name that could drift.
export function findColumn(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}
