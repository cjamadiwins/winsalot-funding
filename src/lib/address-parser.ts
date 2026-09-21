// Best-effort parser for a LeadSwift-style single combined `address` field
// ("123 Main St, Winnipeg, MB R3C 0V8, Canada") into City/Province/Postal
// Code/Country. Deliberately conservative: every extraction here is a
// pattern match against an unambiguous signal (a postal/ZIP code shape, a
// known province/state name or abbreviation, a known country name) - there
// is no fuzzy guessing, no geocoding, and no invented data. A field this
// can't confidently identify is left blank rather than guessed.
//
// Never used to alter the original address string itself - callers keep
// that verbatim in street_address regardless of what this parses out of
// it (see call-list-column-mapping.ts), so nothing from the original
// LeadSwift import is ever lost even when parsing finds nothing.
export type ParsedAddress = {
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

const EMPTY_PARSED: ParsedAddress = { city: "", province: "", postalCode: "", country: "" };

// Canada Post format: letter-digit-letter, space, digit-letter-digit.
const CA_POSTAL_RE = /\b([A-Za-z]\d[A-Za-z])[\s-]?(\d[A-Za-z]\d)\b/;
// US ZIP or ZIP+4. Deliberately requires a word boundary on both sides so
// it never matches the tail end of a longer number (a unit/suite number,
// a phone number fragment, etc.).
const US_ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;

const CA_PROVINCES: Record<string, string> = {
  ab: "AB", alberta: "AB",
  bc: "BC", "british columbia": "BC",
  mb: "MB", manitoba: "MB",
  nb: "NB", "new brunswick": "NB",
  nl: "NL", "newfoundland and labrador": "NL", "newfoundland": "NL",
  ns: "NS", "nova scotia": "NS",
  nt: "NT", "northwest territories": "NT",
  nu: "NU", nunavut: "NU",
  on: "ON", ontario: "ON",
  pe: "PE", "prince edward island": "PE",
  qc: "QC", quebec: "QC", "québec": "QC",
  sk: "SK", saskatchewan: "SK",
  yt: "YT", yukon: "YT",
};

const US_STATES: Record<string, string> = {
  al: "AL", alabama: "AL", ak: "AK", alaska: "AK", az: "AZ", arizona: "AZ", ar: "AR", arkansas: "AR",
  ca: "CA", california: "CA", co: "CO", colorado: "CO", ct: "CT", connecticut: "CT", de: "DE", delaware: "DE",
  fl: "FL", florida: "FL", ga: "GA", georgia: "GA", hi: "HI", hawaii: "HI", id: "ID", idaho: "ID",
  il: "IL", illinois: "IL", in: "IN", indiana: "IN", ia: "IA", iowa: "IA", ks: "KS", kansas: "KS",
  ky: "KY", kentucky: "KY", la: "LA", louisiana: "LA", me: "ME", maine: "ME", md: "MD", maryland: "MD",
  ma: "MA", massachusetts: "MA", mi: "MI", michigan: "MI", mn: "MN", minnesota: "MN", ms: "MS", mississippi: "MS",
  mo: "MO", missouri: "MO", mt: "MT", montana: "MT", ne: "NE", nebraska: "NE", nv: "NV", nevada: "NV",
  nh: "NH", "new hampshire": "NH", nj: "NJ", "new jersey": "NJ", nm: "NM", "new mexico": "NM",
  ny: "NY", "new york": "NY", nc: "NC", "north carolina": "NC", nd: "ND", "north dakota": "ND",
  oh: "OH", ohio: "OH", ok: "OK", oklahoma: "OK", or: "OR", oregon: "OR", pa: "PA", pennsylvania: "PA",
  ri: "RI", "rhode island": "RI", sc: "SC", "south carolina": "SC", sd: "SD", "south dakota": "SD",
  tn: "TN", tennessee: "TN", tx: "TX", texas: "TX", ut: "UT", utah: "UT", vt: "VT", vermont: "VT",
  va: "VA", virginia: "VA", wa: "WA", washington: "WA", wv: "WV", "west virginia": "WV",
  wi: "WI", wisconsin: "WI", wy: "WY", wyoming: "WY", dc: "DC", "district of columbia": "DC",
};

const COUNTRY_NAMES: Record<string, string> = {
  canada: "Canada", ca: "Canada",
  "united states": "United States", "united states of america": "United States",
  usa: "United States", "u.s.a.": "United States", us: "United States", "u.s.": "United States",
};

function normalizeWord(s: string): string {
  return s.trim().toLowerCase().replace(/\.+$/, "");
}

// Finds a known province/state as a whole token inside `segment` (matches
// on word boundaries so e.g. "MB" doesn't match inside a longer word) and
// returns its canonical abbreviation plus the segment with that token
// removed - or null if nothing in the fixed list matches.
function extractProvince(segment: string): { code: string; rest: string } | null {
  const tokens = segment.split(/\s+/).filter(Boolean);
  // Try longest-to-shortest multi-word matches first (e.g. "British Columbia").
  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    for (let start = 0; start + len <= tokens.length; start++) {
      const candidate = normalizeWord(tokens.slice(start, start + len).join(" "));
      const code = CA_PROVINCES[candidate] ?? US_STATES[candidate];
      if (code) {
        const rest = [...tokens.slice(0, start), ...tokens.slice(start + len)].join(" ");
        return { code, rest };
      }
    }
  }
  return null;
}

// Parses one combined address string. Only ever called with a non-blank
// address; returns every field blank if nothing confident can be pulled
// out of it (e.g. no commas and no recognizable postal/province/country
// token - a bare street address with nothing else to go on).
export function parseAddressComponents(rawAddress: string): ParsedAddress {
  const address = rawAddress.trim();
  if (!address) return { ...EMPTY_PARSED };

  let country = "";
  let postalCode = "";
  let province = "";

  // Country: only recognized as an explicit, standalone trailing token -
  // never inferred from the base address text itself (only from a
  // confidently-matched postal code or province below).
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length > 0) {
    const lastNorm = normalizeWord(parts[parts.length - 1]);
    if (COUNTRY_NAMES[lastNorm]) {
      country = COUNTRY_NAMES[lastNorm];
      parts.pop();
    }
  }

  // Postal/ZIP code: search the whole remaining string (not just the last
  // segment) since LeadSwift sometimes puts "MB R3C 0V8" or "R3C 0V8"
  // together in the final comma-separated part.
  const remainingJoined = parts.join(", ");
  const caMatch = remainingJoined.match(CA_POSTAL_RE);
  if (caMatch) {
    postalCode = `${caMatch[1].toUpperCase()} ${caMatch[2].toUpperCase()}`;
    if (!country) country = "Canada";
  } else {
    const usMatch = remainingJoined.match(US_ZIP_RE);
    // Guard against matching a plain street number ("123 Main St") when
    // there's no comma at all to segment the string - a 5-digit ZIP with
    // no other structure to anchor it to is too easy to confuse with a
    // street number, so it's only trusted when the address has at least
    // one comma (i.e. some real segmentation for it to appear after).
    if (usMatch && parts.length > 1) {
      postalCode = usMatch[0];
      if (!country) country = "United States";
    }
  }

  // Remove the matched postal code from whichever segment contained it
  // (tracking that segment's index) so it doesn't get mistaken for part of
  // the city/province below.
  let postalSegmentIndex = -1;
  const partsNoPostal = parts.map((p, i) => {
    if (!postalCode) return p;
    const replaced = p.replace(new RegExp(escapeRegExp(postalCode).replace(/\s+/, "[\\s-]?"), "i"), "").trim();
    if (replaced !== p) postalSegmentIndex = i;
    return replaced;
  });

  // Province/state: only attempted when there's more than one comma-
  // separated segment left (a bare "123 Main St" with no segmentation at
  // all gives nothing safe to search).
  let city = "";
  let provinceIndex = -1;
  if (partsNoPostal.length >= 2) {
    // Search from the end backwards - the province/state is almost always
    // in the last or second-to-last segment.
    for (let i = partsNoPostal.length - 1; i >= 1; i--) {
      const found = extractProvince(partsNoPostal[i]);
      if (found) {
        province = found.code;
        provinceIndex = i;
        partsNoPostal[i] = found.rest;
        if (!country) {
          if (Object.values(CA_PROVINCES).includes(found.code)) country = "Canada";
          else if (Object.values(US_STATES).includes(found.code)) country = "United States";
        }
        break;
      }
    }
  }

  // City is only ever extracted alongside a confirmed province or postal
  // code - that's the external signal this string is genuinely a
  // structured address, not e.g. "123 Main Street, Suite 200" or a second
  // business-name field. It's always the segment immediately before
  // wherever that province/postal code was found (never the first
  // segment - that's the street - and regardless of how many other
  // segments, like a unit/suite line, sit between the two), so an address
  // with extra segments in between is never misread.
  const anchorIndex = provinceIndex >= 0 ? provinceIndex : postalSegmentIndex;
  if (anchorIndex >= 1) {
    const candidate = partsNoPostal[anchorIndex - 1].trim();
    if (candidate) city = candidate;
  }

  return { city, province, postalCode, country };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
