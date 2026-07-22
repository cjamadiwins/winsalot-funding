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

// Best-effort match against the target-city list - used both to filter
// connector candidates down to the covered markets and to fill in
// province/region for a candidate that only mentions a city name.
export function lookupCity(cityRaw: string | null | undefined): CityInfo | null {
  if (!cityRaw) return null;
  const normalized = cityRaw.trim().toLowerCase();
  if (CITY_LOOKUP.has(normalized)) return CITY_LOOKUP.get(normalized) ?? null;
  // Fall back to a substring match (e.g. "Toronto, ON" or "City of Vancouver").
  for (const city of TARGET_CITIES) {
    if (normalized.includes(city.name.toLowerCase())) return city;
  }
  return null;
}

export function regionForCity(cityRaw: string | null | undefined): string | null {
  return lookupCity(cityRaw)?.region ?? null;
}
