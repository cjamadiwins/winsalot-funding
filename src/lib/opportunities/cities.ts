import type { Province } from "./types";

type CityInfo = { name: string; province: Province; region: string };

// Metro Vancouver / Lower Mainland, BC (all one region per the brief).
const BC_CITIES: CityInfo[] = [
  "Vancouver",
  "Burnaby",
  "Richmond",
  "Surrey",
  "New Westminster",
  "Coquitlam",
  "Port Coquitlam",
  "Port Moody",
  "Delta",
  "North Vancouver",
  "West Vancouver",
  "Langley",
  "Maple Ridge",
].map((name) => ({ name, province: "BC", region: "Metro Vancouver / Lower Mainland" }));

// Greater Toronto Area, ON, grouped by the sub-regions administrators filter by.
const ON_CITIES: CityInfo[] = [
  ...["Toronto", "Etobicoke", "North York", "Scarborough", "East York", "York"].map((name) => ({
    name,
    province: "ON" as const,
    region: "City of Toronto",
  })),
  ...["Brampton", "Mississauga", "Caledon", "Bolton"].map((name) => ({
    name,
    province: "ON" as const,
    region: "Peel Region",
  })),
  ...[
    "Vaughan",
    "Markham",
    "Richmond Hill",
    "Aurora",
    "Newmarket",
    "Whitchurch-Stouffville",
    "King",
    "East Gwillimbury",
    "Georgina",
  ].map((name) => ({ name, province: "ON" as const, region: "York Region" })),
  ...[
    "Pickering",
    "Ajax",
    "Whitby",
    "Oshawa",
    "Clarington",
    "Bowmanville",
    "Uxbridge",
    "Scugog",
    "Brock",
  ].map((name) => ({ name, province: "ON" as const, region: "Durham Region" })),
  ...["Oakville", "Burlington", "Milton", "Halton Hills", "Georgetown", "Acton"].map((name) => ({
    name,
    province: "ON" as const,
    region: "Halton Region",
  })),
];

export const TARGET_CITIES: CityInfo[] = [...BC_CITIES, ...ON_CITIES];

// Search each city first, in this order, per the brief's priority markets.
export const PRIORITY_CITIES = [
  "Toronto",
  "Mississauga",
  "Brampton",
  "Vaughan",
  "Markham",
  "Richmond Hill",
  "Oakville",
  "Burlington",
  "Pickering",
  "Ajax",
  "Whitby",
  "Oshawa",
  "Vancouver",
  "Burnaby",
  "Richmond",
  "Surrey",
];

export const REGIONS = Array.from(new Set(TARGET_CITIES.map((c) => c.region)));

const CITY_LOOKUP = new Map<string, CityInfo>(TARGET_CITIES.map((c) => [c.name.toLowerCase(), c]));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One compiled word-boundary pattern per target city, built once - e.g.
// \bking\b, so "King" only matches the standalone word, never as a
// substring of "parking" or "seeking" (a real false match that put a
// Northern Canada facilities tender and an Ottawa janitorial tender on
// Metro Vancouver/GTA's own city list: "par-KING lots" / "see-KING
// offers" both naively contained "king"). Word boundaries only work
// reliably for single-word city names; the two-word names below fall back
// to a plain (still safer than the old blanket .includes()) substring
// check since \b doesn't apply meaningfully across an internal space.
const CITY_PATTERNS = new Map<string, RegExp>(
  TARGET_CITIES.filter((c) => !c.name.includes(" ") && !c.name.includes("-")).map((c) => [
    c.name.toLowerCase(),
    new RegExp(`\\b${escapeRegExp(c.name.toLowerCase())}\\b`),
  ])
);

// Best-effort match against the target-city list - used both to filter
// connector candidates down to the covered markets and to fill in
// province/region for a candidate that only mentions a city name. Callers
// that have a legitimate structured location field (e.g. CanadaBuys'
// entityCity column) should call this on that field alone rather than on
// a full title/description - scanning freeform text for any city mention
// is exactly the "guessing" this function's word-boundary matching
// reduces but can't eliminate.
export function lookupCity(cityRaw: string | null | undefined): CityInfo | null {
  if (!cityRaw) return null;
  const normalized = cityRaw.trim().toLowerCase();
  if (CITY_LOOKUP.has(normalized)) return CITY_LOOKUP.get(normalized) ?? null;
  // Fall back to a word-boundary match (e.g. "Toronto, ON" or "City of Vancouver").
  for (const city of TARGET_CITIES) {
    const pattern = CITY_PATTERNS.get(city.name.toLowerCase());
    if (pattern) {
      if (pattern.test(normalized)) return city;
    } else if (normalized.includes(city.name.toLowerCase())) {
      return city;
    }
  }
  return null;
}

export function regionForCity(cityRaw: string | null | undefined): string | null {
  return lookupCity(cityRaw)?.region ?? null;
}
