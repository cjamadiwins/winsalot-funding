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

// Approximate centre coordinates and a half-width/height radius (degrees)
// per target city, used only to size the qualified-prospects connector's
// per-city Overpass query area - never to decide which city a result
// belongs to. That's always the structured addr:city tag matched through
// lookupCity() above; a business inside a city's bbox but tagged with a
// different (or no) city is still rejected, not guessed into place. Radius
// is a rough eyeball of each municipality's built-up extent, not a survey
// boundary - imprecision here only widens or narrows the query, it can't
// misattribute a result.
type CityBounds = { lat: number; lon: number; radius: number };

const CITY_BOUNDS: Record<string, CityBounds> = {
  // Metro Vancouver / Lower Mainland
  Vancouver: { lat: 49.2827, lon: -123.1207, radius: 0.09 },
  Burnaby: { lat: 49.2488, lon: -122.9805, radius: 0.07 },
  Richmond: { lat: 49.1666, lon: -123.1336, radius: 0.08 },
  Surrey: { lat: 49.1913, lon: -122.849, radius: 0.12 },
  "New Westminster": { lat: 49.2057, lon: -122.911, radius: 0.04 },
  Coquitlam: { lat: 49.2838, lon: -122.7932, radius: 0.07 },
  "Port Coquitlam": { lat: 49.2621, lon: -122.7817, radius: 0.04 },
  "Port Moody": { lat: 49.2838, lon: -122.8324, radius: 0.03 },
  Delta: { lat: 49.0847, lon: -123.0587, radius: 0.09 },
  "North Vancouver": { lat: 49.32, lon: -123.0731, radius: 0.06 },
  "West Vancouver": { lat: 49.3286, lon: -123.1594, radius: 0.06 },
  Langley: { lat: 49.1044, lon: -122.6604, radius: 0.08 },
  "Maple Ridge": { lat: 49.2193, lon: -122.5984, radius: 0.07 },
  // Greater Toronto Area
  Toronto: { lat: 43.6532, lon: -79.3832, radius: 0.14 },
  Etobicoke: { lat: 43.6205, lon: -79.5132, radius: 0.08 },
  "North York": { lat: 43.7615, lon: -79.4111, radius: 0.09 },
  Scarborough: { lat: 43.7764, lon: -79.2318, radius: 0.1 },
  "East York": { lat: 43.6913, lon: -79.3288, radius: 0.03 },
  York: { lat: 43.6896, lon: -79.4536, radius: 0.03 },
  Brampton: { lat: 43.7315, lon: -79.7624, radius: 0.1 },
  Mississauga: { lat: 43.589, lon: -79.6441, radius: 0.12 },
  Caledon: { lat: 43.8668, lon: -79.8656, radius: 0.15 },
  Bolton: { lat: 43.8749, lon: -79.7307, radius: 0.04 },
  Vaughan: { lat: 43.8361, lon: -79.4985, radius: 0.09 },
  Markham: { lat: 43.8561, lon: -79.337, radius: 0.09 },
  "Richmond Hill": { lat: 43.8828, lon: -79.4403, radius: 0.06 },
  Aurora: { lat: 44.0065, lon: -79.4504, radius: 0.04 },
  Newmarket: { lat: 44.0592, lon: -79.4613, radius: 0.04 },
  "Whitchurch-Stouffville": { lat: 44.0, lon: -79.25, radius: 0.06 },
  King: { lat: 43.9297, lon: -79.5333, radius: 0.09 },
  "East Gwillimbury": { lat: 44.1436, lon: -79.4514, radius: 0.09 },
  Georgina: { lat: 44.2794, lon: -79.4342, radius: 0.1 },
  Pickering: { lat: 43.8384, lon: -79.0868, radius: 0.06 },
  Ajax: { lat: 43.8509, lon: -79.0204, radius: 0.04 },
  Whitby: { lat: 43.8975, lon: -78.9429, radius: 0.05 },
  Oshawa: { lat: 43.8971, lon: -78.8658, radius: 0.06 },
  Clarington: { lat: 43.9328, lon: -78.6109, radius: 0.12 },
  Bowmanville: { lat: 43.9107, lon: -78.6883, radius: 0.03 },
  Uxbridge: { lat: 44.1075, lon: -79.1206, radius: 0.07 },
  Scugog: { lat: 44.1057, lon: -78.9436, radius: 0.1 },
  Brock: { lat: 44.3167, lon: -79.0333, radius: 0.12 },
  Oakville: { lat: 43.4675, lon: -79.6877, radius: 0.06 },
  Burlington: { lat: 43.3255, lon: -79.799, radius: 0.08 },
  Milton: { lat: 43.5183, lon: -79.8774, radius: 0.07 },
  "Halton Hills": { lat: 43.6467, lon: -79.9291, radius: 0.09 },
  Georgetown: { lat: 43.65, lon: -79.9167, radius: 0.03 },
  Acton: { lat: 43.6333, lon: -80.0333, radius: 0.03 },
};

// Overpass bbox format: south,west,north,east.
export function bboxForCity(cityName: string): string {
  const bounds = CITY_BOUNDS[cityName];
  if (!bounds) throw new Error(`No bounding box configured for city "${cityName}"`);
  const { lat, lon, radius } = bounds;
  return `${(lat - radius).toFixed(4)},${(lon - radius).toFixed(4)},${(lat + radius).toFixed(4)},${(lon + radius).toFixed(4)}`;
}
