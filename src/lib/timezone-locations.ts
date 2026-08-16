// Canonical list of selectable "Client Local Time" locations for the CRM
// dual-time panel: every Canadian province/territory and every U.S. state
// (plus Washington, D.C.), each with one or more major cities mapped to
// their real IANA time zone - not a fixed UTC offset, so DST and regional
// exceptions (Arizona/Hawaii never observe DST, Saskatchewan and most of
// Yukon never observe DST, northeastern British Columbia stays on
// Mountain Standard Time year-round, etc.) are handled correctly by the
// zone's own rules rather than hardcoded here. A handful of other
// well-known intra-state/province splits (e.g. Texas panhandle vs. El
// Paso, Indiana, Kentucky, the Dakotas, Nebraska, Idaho, Oregon,
// Newfoundland vs. Labrador) get a second city for the same reason.
//
// This file is the single source of truth both the UI (searchable
// selectors) and the server action (validating a saved selection) read
// from - a client can only ever save a {country, region, city} triple
// that exists here, and the time zone always comes from this table, never
// from client input.

export type LocationCountry = "CA" | "US";

export type RegionOption = {
  code: string;
  name: string;
  country: LocationCountry;
};

export type CityOption = {
  city: string;
  regionCode: string;
  country: LocationCountry;
  timeZone: string;
};

export const CA_REGIONS: RegionOption[] = [
  { code: "AB", name: "Alberta", country: "CA" },
  { code: "BC", name: "British Columbia", country: "CA" },
  { code: "MB", name: "Manitoba", country: "CA" },
  { code: "NB", name: "New Brunswick", country: "CA" },
  { code: "NL", name: "Newfoundland and Labrador", country: "CA" },
  { code: "NS", name: "Nova Scotia", country: "CA" },
  { code: "NT", name: "Northwest Territories", country: "CA" },
  { code: "NU", name: "Nunavut", country: "CA" },
  { code: "ON", name: "Ontario", country: "CA" },
  { code: "PE", name: "Prince Edward Island", country: "CA" },
  { code: "QC", name: "Quebec", country: "CA" },
  { code: "SK", name: "Saskatchewan", country: "CA" },
  { code: "YT", name: "Yukon", country: "CA" },
];

export const US_REGIONS: RegionOption[] = [
  { code: "AL", name: "Alabama", country: "US" },
  { code: "AK", name: "Alaska", country: "US" },
  { code: "AZ", name: "Arizona", country: "US" },
  { code: "AR", name: "Arkansas", country: "US" },
  { code: "CA", name: "California", country: "US" },
  { code: "CO", name: "Colorado", country: "US" },
  { code: "CT", name: "Connecticut", country: "US" },
  { code: "DE", name: "Delaware", country: "US" },
  { code: "DC", name: "Washington, D.C.", country: "US" },
  { code: "FL", name: "Florida", country: "US" },
  { code: "GA", name: "Georgia", country: "US" },
  { code: "HI", name: "Hawaii", country: "US" },
  { code: "ID", name: "Idaho", country: "US" },
  { code: "IL", name: "Illinois", country: "US" },
  { code: "IN", name: "Indiana", country: "US" },
  { code: "IA", name: "Iowa", country: "US" },
  { code: "KS", name: "Kansas", country: "US" },
  { code: "KY", name: "Kentucky", country: "US" },
  { code: "LA", name: "Louisiana", country: "US" },
  { code: "ME", name: "Maine", country: "US" },
  { code: "MD", name: "Maryland", country: "US" },
  { code: "MA", name: "Massachusetts", country: "US" },
  { code: "MI", name: "Michigan", country: "US" },
  { code: "MN", name: "Minnesota", country: "US" },
  { code: "MS", name: "Mississippi", country: "US" },
  { code: "MO", name: "Missouri", country: "US" },
  { code: "MT", name: "Montana", country: "US" },
  { code: "NE", name: "Nebraska", country: "US" },
  { code: "NV", name: "Nevada", country: "US" },
  { code: "NH", name: "New Hampshire", country: "US" },
  { code: "NJ", name: "New Jersey", country: "US" },
  { code: "NM", name: "New Mexico", country: "US" },
  { code: "NY", name: "New York", country: "US" },
  { code: "NC", name: "North Carolina", country: "US" },
  { code: "ND", name: "North Dakota", country: "US" },
  { code: "OH", name: "Ohio", country: "US" },
  { code: "OK", name: "Oklahoma", country: "US" },
  { code: "OR", name: "Oregon", country: "US" },
  { code: "PA", name: "Pennsylvania", country: "US" },
  { code: "RI", name: "Rhode Island", country: "US" },
  { code: "SC", name: "South Carolina", country: "US" },
  { code: "SD", name: "South Dakota", country: "US" },
  { code: "TN", name: "Tennessee", country: "US" },
  { code: "TX", name: "Texas", country: "US" },
  { code: "UT", name: "Utah", country: "US" },
  { code: "VT", name: "Vermont", country: "US" },
  { code: "VA", name: "Virginia", country: "US" },
  { code: "WA", name: "Washington", country: "US" },
  { code: "WV", name: "West Virginia", country: "US" },
  { code: "WI", name: "Wisconsin", country: "US" },
  { code: "WY", name: "Wyoming", country: "US" },
];

export const REGIONS: RegionOption[] = [...CA_REGIONS, ...US_REGIONS];

export const CITIES: CityOption[] = [
  // --- Canada ---------------------------------------------------------
  { city: "Calgary", regionCode: "AB", country: "CA", timeZone: "America/Edmonton" },
  { city: "Edmonton", regionCode: "AB", country: "CA", timeZone: "America/Edmonton" },

  { city: "Vancouver", regionCode: "BC", country: "CA", timeZone: "America/Vancouver" },
  { city: "Victoria", regionCode: "BC", country: "CA", timeZone: "America/Vancouver" },
  { city: "Kelowna", regionCode: "BC", country: "CA", timeZone: "America/Vancouver" },
  // Fort St. John / the northeast corner of B.C. stays on Mountain
  // Standard Time year-round (no DST) - the "different time rules" area
  // the panel is required to be able to represent.
  { city: "Fort St. John", regionCode: "BC", country: "CA", timeZone: "America/Dawson_Creek" },

  { city: "Winnipeg", regionCode: "MB", country: "CA", timeZone: "America/Winnipeg" },
  { city: "Brandon", regionCode: "MB", country: "CA", timeZone: "America/Winnipeg" },

  { city: "Moncton", regionCode: "NB", country: "CA", timeZone: "America/Moncton" },
  { city: "Fredericton", regionCode: "NB", country: "CA", timeZone: "America/Moncton" },

  { city: "St. John's", regionCode: "NL", country: "CA", timeZone: "America/St_Johns" },
  // Labrador observes Atlantic Time, a full hour off Newfoundland Time on
  // the rest of the island - same province, different zone.
  { city: "Happy Valley-Goose Bay", regionCode: "NL", country: "CA", timeZone: "America/Goose_Bay" },

  { city: "Halifax", regionCode: "NS", country: "CA", timeZone: "America/Halifax" },
  { city: "Sydney", regionCode: "NS", country: "CA", timeZone: "America/Halifax" },

  { city: "Yellowknife", regionCode: "NT", country: "CA", timeZone: "America/Edmonton" },
  { city: "Inuvik", regionCode: "NT", country: "CA", timeZone: "America/Inuvik" },

  { city: "Iqaluit", regionCode: "NU", country: "CA", timeZone: "America/Iqaluit" },
  { city: "Rankin Inlet", regionCode: "NU", country: "CA", timeZone: "America/Rankin_Inlet" },
  { city: "Cambridge Bay", regionCode: "NU", country: "CA", timeZone: "America/Cambridge_Bay" },

  { city: "Toronto", regionCode: "ON", country: "CA", timeZone: "America/Toronto" },
  { city: "Ottawa", regionCode: "ON", country: "CA", timeZone: "America/Toronto" },
  { city: "Hamilton", regionCode: "ON", country: "CA", timeZone: "America/Toronto" },
  { city: "London", regionCode: "ON", country: "CA", timeZone: "America/Toronto" },

  { city: "Charlottetown", regionCode: "PE", country: "CA", timeZone: "America/Halifax" },

  { city: "Montreal", regionCode: "QC", country: "CA", timeZone: "America/Toronto" },
  { city: "Quebec City", regionCode: "QC", country: "CA", timeZone: "America/Toronto" },

  // Saskatchewan does not observe DST - it stays on Central Standard
  // Time all year, another required regional exception.
  { city: "Regina", regionCode: "SK", country: "CA", timeZone: "America/Regina" },
  { city: "Saskatoon", regionCode: "SK", country: "CA", timeZone: "America/Regina" },

  // Yukon has observed permanent Mountain Standard Time (no DST) since
  // November 2020 - the third required Canadian DST exception.
  { city: "Whitehorse", regionCode: "YT", country: "CA", timeZone: "America/Whitehorse" },
  { city: "Dawson City", regionCode: "YT", country: "CA", timeZone: "America/Dawson" },

  // --- United States ----------------------------------------------------
  { city: "Birmingham", regionCode: "AL", country: "US", timeZone: "America/Chicago" },

  { city: "Anchorage", regionCode: "AK", country: "US", timeZone: "America/Anchorage" },
  { city: "Adak", regionCode: "AK", country: "US", timeZone: "America/Adak" },

  // Arizona does not observe DST (outside the Navajo Nation) - the
  // canonical required exception.
  { city: "Phoenix", regionCode: "AZ", country: "US", timeZone: "America/Phoenix" },

  { city: "Little Rock", regionCode: "AR", country: "US", timeZone: "America/Chicago" },

  { city: "Los Angeles", regionCode: "CA", country: "US", timeZone: "America/Los_Angeles" },
  { city: "San Francisco", regionCode: "CA", country: "US", timeZone: "America/Los_Angeles" },

  { city: "Denver", regionCode: "CO", country: "US", timeZone: "America/Denver" },

  { city: "Hartford", regionCode: "CT", country: "US", timeZone: "America/New_York" },

  { city: "Wilmington", regionCode: "DE", country: "US", timeZone: "America/New_York" },

  { city: "Washington", regionCode: "DC", country: "US", timeZone: "America/New_York" },

  { city: "Miami", regionCode: "FL", country: "US", timeZone: "America/New_York" },
  // The Florida Panhandle west of the Apalachicola River is Central Time.
  { city: "Pensacola", regionCode: "FL", country: "US", timeZone: "America/Chicago" },

  { city: "Atlanta", regionCode: "GA", country: "US", timeZone: "America/New_York" },

  // Hawaii does not observe DST - the other canonical required exception.
  { city: "Honolulu", regionCode: "HI", country: "US", timeZone: "Pacific/Honolulu" },

  { city: "Boise", regionCode: "ID", country: "US", timeZone: "America/Boise" },
  // The Idaho Panhandle is Pacific Time.
  { city: "Coeur d'Alene", regionCode: "ID", country: "US", timeZone: "America/Los_Angeles" },

  { city: "Chicago", regionCode: "IL", country: "US", timeZone: "America/Chicago" },

  { city: "Indianapolis", regionCode: "IN", country: "US", timeZone: "America/Indianapolis" },
  // A handful of northwest/southwest Indiana counties are Central Time.
  { city: "Gary", regionCode: "IN", country: "US", timeZone: "America/Chicago" },

  { city: "Des Moines", regionCode: "IA", country: "US", timeZone: "America/Chicago" },

  { city: "Wichita", regionCode: "KS", country: "US", timeZone: "America/Chicago" },
  // Western Kansas is Mountain Time.
  { city: "Goodland", regionCode: "KS", country: "US", timeZone: "America/Denver" },

  { city: "Louisville", regionCode: "KY", country: "US", timeZone: "America/New_York" },
  // Western Kentucky is Central Time.
  { city: "Bowling Green", regionCode: "KY", country: "US", timeZone: "America/Chicago" },

  { city: "New Orleans", regionCode: "LA", country: "US", timeZone: "America/Chicago" },

  { city: "Portland", regionCode: "ME", country: "US", timeZone: "America/New_York" },

  { city: "Baltimore", regionCode: "MD", country: "US", timeZone: "America/New_York" },

  { city: "Boston", regionCode: "MA", country: "US", timeZone: "America/New_York" },

  { city: "Detroit", regionCode: "MI", country: "US", timeZone: "America/Detroit" },
  // The western Upper Peninsula is Central Time.
  { city: "Ironwood", regionCode: "MI", country: "US", timeZone: "America/Menominee" },

  { city: "Minneapolis", regionCode: "MN", country: "US", timeZone: "America/Chicago" },

  { city: "Jackson", regionCode: "MS", country: "US", timeZone: "America/Chicago" },

  { city: "Kansas City", regionCode: "MO", country: "US", timeZone: "America/Chicago" },

  { city: "Billings", regionCode: "MT", country: "US", timeZone: "America/Denver" },

  { city: "Omaha", regionCode: "NE", country: "US", timeZone: "America/Chicago" },
  // The Nebraska Panhandle is Mountain Time.
  { city: "Scottsbluff", regionCode: "NE", country: "US", timeZone: "America/Denver" },

  { city: "Las Vegas", regionCode: "NV", country: "US", timeZone: "America/Los_Angeles" },

  { city: "Manchester", regionCode: "NH", country: "US", timeZone: "America/New_York" },

  { city: "Newark", regionCode: "NJ", country: "US", timeZone: "America/New_York" },

  { city: "Albuquerque", regionCode: "NM", country: "US", timeZone: "America/Denver" },

  { city: "New York City", regionCode: "NY", country: "US", timeZone: "America/New_York" },

  { city: "Charlotte", regionCode: "NC", country: "US", timeZone: "America/New_York" },

  { city: "Fargo", regionCode: "ND", country: "US", timeZone: "America/Chicago" },
  // Western North Dakota (around Williston) is Mountain Time.
  { city: "Williston", regionCode: "ND", country: "US", timeZone: "America/Denver" },

  { city: "Columbus", regionCode: "OH", country: "US", timeZone: "America/New_York" },

  { city: "Oklahoma City", regionCode: "OK", country: "US", timeZone: "America/Chicago" },

  { city: "Portland", regionCode: "OR", country: "US", timeZone: "America/Los_Angeles" },
  // Malheur County (around Ontario, OR) is Mountain Time.
  { city: "Ontario", regionCode: "OR", country: "US", timeZone: "America/Boise" },

  { city: "Philadelphia", regionCode: "PA", country: "US", timeZone: "America/New_York" },

  { city: "Providence", regionCode: "RI", country: "US", timeZone: "America/New_York" },

  { city: "Charleston", regionCode: "SC", country: "US", timeZone: "America/New_York" },

  { city: "Sioux Falls", regionCode: "SD", country: "US", timeZone: "America/Chicago" },
  // Western South Dakota is Mountain Time.
  { city: "Rapid City", regionCode: "SD", country: "US", timeZone: "America/Denver" },

  // Tennessee splits roughly down the middle: Nashville/Memphis are
  // Central, Knoxville/Chattanooga are Eastern.
  { city: "Nashville", regionCode: "TN", country: "US", timeZone: "America/Chicago" },
  { city: "Knoxville", regionCode: "TN", country: "US", timeZone: "America/New_York" },

  { city: "Houston", regionCode: "TX", country: "US", timeZone: "America/Chicago" },
  // Far West Texas (El Paso) is Mountain Time.
  { city: "El Paso", regionCode: "TX", country: "US", timeZone: "America/Denver" },

  { city: "Salt Lake City", regionCode: "UT", country: "US", timeZone: "America/Denver" },

  { city: "Burlington", regionCode: "VT", country: "US", timeZone: "America/New_York" },

  { city: "Virginia Beach", regionCode: "VA", country: "US", timeZone: "America/New_York" },

  { city: "Seattle", regionCode: "WA", country: "US", timeZone: "America/Los_Angeles" },

  { city: "Charleston", regionCode: "WV", country: "US", timeZone: "America/New_York" },

  { city: "Milwaukee", regionCode: "WI", country: "US", timeZone: "America/Chicago" },

  { city: "Cheyenne", regionCode: "WY", country: "US", timeZone: "America/Denver" },
];

export function regionsForCountry(country: LocationCountry): RegionOption[] {
  return REGIONS.filter((r) => r.country === country);
}

export function citiesForRegion(country: LocationCountry, regionCode: string): CityOption[] {
  return CITIES.filter((c) => c.country === country && c.regionCode === regionCode);
}

export function findRegion(country: LocationCountry, regionCode: string): RegionOption | undefined {
  return REGIONS.find((r) => r.country === country && r.code === regionCode);
}

export function findCity(country: LocationCountry, regionCode: string, city: string): CityOption | undefined {
  return CITIES.find((c) => c.country === country && c.regionCode === regionCode && c.city === city);
}

export type SavedLocation = {
  country: LocationCountry;
  regionCode: string;
  city: string;
  timeZone: string;
};

export const DEFAULT_LOCATION_1: SavedLocation = {
  country: "CA",
  regionCode: "ON",
  city: "Toronto",
  timeZone: "America/Toronto",
};

export const DEFAULT_LOCATION_2: SavedLocation = {
  country: "CA",
  regionCode: "BC",
  city: "Vancouver",
  timeZone: "America/Vancouver",
};

// Re-derives the correct timeZone for a client-supplied {country, region,
// city} triple from this table instead of trusting a client-supplied
// timeZone - used by the save Server Action so a tampered request can
// never persist an arbitrary/fake time zone string.
export function resolveLocation(country: LocationCountry, regionCode: string, city: string): SavedLocation | null {
  const match = findCity(country, regionCode, city);
  if (!match) return null;
  return { country, regionCode, city, timeZone: match.timeZone };
}
