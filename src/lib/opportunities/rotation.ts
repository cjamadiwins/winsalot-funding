import { TARGET_CITIES } from "./cities";
import { INDUSTRY_OSM_MAPPINGS, type IndustryOsmMapping } from "./industries";
import type { Province } from "./types";

export type CityIndustryPair = {
  cityName: string;
  province: Province;
  mapping: IndustryOsmMapping;
};

const ALL_PAIRS: CityIndustryPair[] = TARGET_CITIES.flatMap((city) =>
  INDUSTRY_OSM_MAPPINGS.map((mapping) => ({ cityName: city.name, province: city.province, mapping }))
);

// How many (city, industry) pairs the qualified-prospects connector queries
// per day. 47 target cities x 13 mapped industries = 611 pairs total;
// PAIRS_PER_DAY of 45 cycles through the full matrix roughly every two
// weeks, so no city/industry combination goes stale for long, without
// querying the shared public Overpass instance any harder per run than a
// fixed region-based sweep would.
const PAIRS_PER_DAY = 45;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - start) / (24 * 60 * 60 * 1000));
}

// Deterministic, stateless day-based rotation - "today's search" is fully
// reproducible from the date alone (UTC calendar day) and needs no
// persisted "where did we leave off" cursor. Each day maps to a different
// contiguous slice of the full city x industry matrix, wrapping around once
// the matrix is exhausted.
export function todaysCityIndustryPairs(now: Date = new Date()): CityIndustryPair[] {
  const offset = (dayOfYear(now) * PAIRS_PER_DAY) % ALL_PAIRS.length;
  const pairs: CityIndustryPair[] = [];
  for (let i = 0; i < PAIRS_PER_DAY; i++) {
    pairs.push(ALL_PAIRS[(offset + i) % ALL_PAIRS.length]);
  }
  return pairs;
}
