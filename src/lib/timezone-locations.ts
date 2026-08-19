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
// from client input. Each city also carries a one-line `fact` about its
// major business sectors, shown in the "Market Snapshot" section of that
// city's Client Local Time card (src/components/crm-ui/ClientLocalTimePanel.tsx)
// - kept here, not the persisted preference, since it's derived content
// looked up by {country, regionCode, city}, not something a user chooses.

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
  fact: string;
  // City-center coordinates, used only for the Client Local Time weather
  // lookup (src/lib/weather.ts) - deliberately explicit per city rather
  // than geocoded from the city name at request time, since several
  // names in this table are ambiguous on their own (two Portlands, two
  // Charlestons, London ON vs. London UK, etc.) and a name-based lookup
  // could silently resolve to the wrong place.
  lat: number;
  lon: number;
};

export const COUNTRY_NAMES: Record<LocationCountry, string> = {
  CA: "Canada",
  US: "United States",
};

export function countryName(country: LocationCountry): string {
  return COUNTRY_NAMES[country];
}

// The country flag itself is rendered as an SVG icon, not a Unicode flag
// emoji - see src/components/crm-ui/FlagIcon.tsx. Windows' Chrome/Edge
// (no OS-level flag emoji font) renders flag emoji as the two-letter
// region code text ("CA", "US") instead of a flag, so an emoji can't be
// used here if the flag needs to reliably look like a flag everywhere.

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
  { city: "Calgary", regionCode: "AB", country: "CA", timeZone: "America/Edmonton", fact: "Energy sector hub — oil, gas, and pipeline headquarters.", lat: 51.05, lon: -114.07 },
  { city: "Edmonton", regionCode: "AB", country: "CA", timeZone: "America/Edmonton", fact: "Petrochemical processing and manufacturing hub.", lat: 53.55, lon: -113.49 },

  { city: "Vancouver", regionCode: "BC", country: "CA", timeZone: "America/Vancouver", fact: "Film production, technology, and Asia-Pacific trade gateway.", lat: 49.28, lon: -123.12 },
  { city: "Victoria", regionCode: "BC", country: "CA", timeZone: "America/Vancouver", fact: "Government, tourism, and marine technology center.", lat: 48.43, lon: -123.37 },
  { city: "Kelowna", regionCode: "BC", country: "CA", timeZone: "America/Vancouver", fact: "Wine industry, tourism, and a growing tech sector.", lat: 49.89, lon: -119.50 },
  // Fort St. John / the northeast corner of B.C. stays on Mountain
  // Standard Time year-round (no DST) - the "different time rules" area
  // the panel is required to be able to represent.
  { city: "Fort St. John", regionCode: "BC", country: "CA", timeZone: "America/Dawson_Creek", fact: "Natural gas and energy services hub for northeastern B.C.", lat: 56.25, lon: -120.85 },

  { city: "Winnipeg", regionCode: "MB", country: "CA", timeZone: "America/Winnipeg", fact: "Aerospace manufacturing, agribusiness, and transportation hub.", lat: 49.90, lon: -97.14 },
  { city: "Brandon", regionCode: "MB", country: "CA", timeZone: "America/Winnipeg", fact: "Agriculture and food processing center.", lat: 49.85, lon: -99.95 },

  { city: "Moncton", regionCode: "NB", country: "CA", timeZone: "America/Moncton", fact: "Distribution, logistics, and bilingual customer service hub.", lat: 46.09, lon: -64.79 },
  { city: "Fredericton", regionCode: "NB", country: "CA", timeZone: "America/Moncton", fact: "Government, education, and cybersecurity sector.", lat: 45.96, lon: -66.64 },

  { city: "St. John's", regionCode: "NL", country: "CA", timeZone: "America/St_Johns", fact: "Offshore oil and gas, and marine research hub.", lat: 47.56, lon: -52.71 },
  // Labrador observes Atlantic Time, a full hour off Newfoundland Time on
  // the rest of the island - same province, different zone.
  { city: "Happy Valley-Goose Bay", regionCode: "NL", country: "CA", timeZone: "America/Goose_Bay", fact: "Defense, aviation, and regional resource services.", lat: 53.30, lon: -60.42 },

  { city: "Halifax", regionCode: "NS", country: "CA", timeZone: "America/Halifax", fact: "Shipping, defense, and financial services hub.", lat: 44.65, lon: -63.57 },
  { city: "Sydney", regionCode: "NS", country: "CA", timeZone: "America/Halifax", fact: "Call center services and offshore energy support.", lat: 46.14, lon: -60.19 },

  { city: "Yellowknife", regionCode: "NT", country: "CA", timeZone: "America/Edmonton", fact: "Diamond mining and territorial government center.", lat: 62.45, lon: -114.37 },
  { city: "Inuvik", regionCode: "NT", country: "CA", timeZone: "America/Inuvik", fact: "Arctic research and oil/gas exploration support.", lat: 68.36, lon: -133.72 },

  { city: "Iqaluit", regionCode: "NU", country: "CA", timeZone: "America/Iqaluit", fact: "Territorial government and mining logistics hub.", lat: 63.75, lon: -68.51 },
  { city: "Rankin Inlet", regionCode: "NU", country: "CA", timeZone: "America/Rankin_Inlet", fact: "Regional mining services and government hub.", lat: 62.81, lon: -92.09 },
  { city: "Cambridge Bay", regionCode: "NU", country: "CA", timeZone: "America/Cambridge_Bay", fact: "Arctic research and marine navigation support.", lat: 69.12, lon: -105.05 },

  { city: "Toronto", regionCode: "ON", country: "CA", timeZone: "America/Toronto", fact: "Canada's financial capital — banking, finance, and technology.", lat: 43.65, lon: -79.38 },
  { city: "Ottawa", regionCode: "ON", country: "CA", timeZone: "America/Toronto", fact: "Federal government, technology, and defense sector hub.", lat: 45.42, lon: -75.70 },
  { city: "Hamilton", regionCode: "ON", country: "CA", timeZone: "America/Toronto", fact: "Steel manufacturing and a growing healthcare sector.", lat: 43.26, lon: -79.87 },
  { city: "London", regionCode: "ON", country: "CA", timeZone: "America/Toronto", fact: "Insurance, healthcare, and manufacturing hub.", lat: 42.98, lon: -81.25 },

  { city: "Charlottetown", regionCode: "PE", country: "CA", timeZone: "America/Halifax", fact: "Bioscience, tourism, and government services hub.", lat: 46.24, lon: -63.13 },

  { city: "Montreal", regionCode: "QC", country: "CA", timeZone: "America/Toronto", fact: "Aerospace, AI research, and finance hub.", lat: 45.50, lon: -73.57 },
  { city: "Quebec City", regionCode: "QC", country: "CA", timeZone: "America/Toronto", fact: "Insurance, tourism, and provincial government hub.", lat: 46.81, lon: -71.21 },

  // Saskatchewan does not observe DST - it stays on Central Standard
  // Time all year, another required regional exception.
  { city: "Regina", regionCode: "SK", country: "CA", timeZone: "America/Regina", fact: "Agriculture, potash mining, and energy hub.", lat: 50.45, lon: -104.62 },
  { city: "Saskatoon", regionCode: "SK", country: "CA", timeZone: "America/Regina", fact: "Mining, agriculture technology, and biotech hub.", lat: 52.13, lon: -106.67 },

  // Yukon has observed permanent Mountain Standard Time (no DST) since
  // November 2020 - the third required Canadian DST exception.
  { city: "Whitehorse", regionCode: "YT", country: "CA", timeZone: "America/Whitehorse", fact: "Mining services, tourism, and territorial government.", lat: 60.72, lon: -135.06 },
  { city: "Dawson City", regionCode: "YT", country: "CA", timeZone: "America/Dawson", fact: "Gold mining heritage and tourism hub.", lat: 64.06, lon: -139.43 },

  // --- United States ----------------------------------------------------
  { city: "Birmingham", regionCode: "AL", country: "US", timeZone: "America/Chicago", fact: "Banking, healthcare, and steel manufacturing hub.", lat: 33.52, lon: -86.81 },

  { city: "Anchorage", regionCode: "AK", country: "US", timeZone: "America/Anchorage", fact: "Oil, transportation, and fishing industry hub.", lat: 61.22, lon: -149.90 },
  { city: "Adak", regionCode: "AK", country: "US", timeZone: "America/Adak", fact: "Fishing industry and remote logistics support.", lat: 51.88, lon: -176.66 },

  // Arizona does not observe DST (outside the Navajo Nation) - the
  // canonical required exception.
  { city: "Phoenix", regionCode: "AZ", country: "US", timeZone: "America/Phoenix", fact: "Semiconductor manufacturing and a growing tech sector.", lat: 33.45, lon: -112.07 },

  { city: "Little Rock", regionCode: "AR", country: "US", timeZone: "America/Chicago", fact: "Distribution, healthcare, and government services hub.", lat: 34.75, lon: -92.29 },

  { city: "Los Angeles", regionCode: "CA", country: "US", timeZone: "America/Los_Angeles", fact: "Entertainment, media, and international trade hub.", lat: 34.05, lon: -118.24 },
  { city: "San Francisco", regionCode: "CA", country: "US", timeZone: "America/Los_Angeles", fact: "Technology, venture capital, and finance hub.", lat: 37.77, lon: -122.42 },

  { city: "Denver", regionCode: "CO", country: "US", timeZone: "America/Denver", fact: "Energy, aerospace, and finance hub.", lat: 39.74, lon: -104.99 },

  { city: "Hartford", regionCode: "CT", country: "US", timeZone: "America/New_York", fact: "Insurance industry headquarters hub.", lat: 41.76, lon: -72.69 },

  { city: "Wilmington", regionCode: "DE", country: "US", timeZone: "America/New_York", fact: "Banking, finance, and corporate law hub.", lat: 39.74, lon: -75.55 },

  { city: "Washington", regionCode: "DC", country: "US", timeZone: "America/New_York", fact: "Federal government, policy, and defense contracting hub.", lat: 38.91, lon: -77.04 },

  { city: "Miami", regionCode: "FL", country: "US", timeZone: "America/New_York", fact: "International trade, finance, and tourism hub.", lat: 25.76, lon: -80.19 },
  // The Florida Panhandle west of the Apalachicola River is Central Time.
  { city: "Pensacola", regionCode: "FL", country: "US", timeZone: "America/Chicago", fact: "Defense, aviation, and tourism hub.", lat: 30.42, lon: -87.22 },

  { city: "Atlanta", regionCode: "GA", country: "US", timeZone: "America/New_York", fact: "Logistics, media, and corporate headquarters hub.", lat: 33.75, lon: -84.39 },

  // Hawaii does not observe DST - the other canonical required exception.
  { city: "Honolulu", regionCode: "HI", country: "US", timeZone: "Pacific/Honolulu", fact: "Tourism, military, and Pacific trade hub.", lat: 21.31, lon: -157.86 },

  { city: "Boise", regionCode: "ID", country: "US", timeZone: "America/Boise", fact: "Technology, agriculture, and food processing hub.", lat: 43.62, lon: -116.20 },
  // The Idaho Panhandle is Pacific Time.
  { city: "Coeur d'Alene", regionCode: "ID", country: "US", timeZone: "America/Los_Angeles", fact: "Tourism, mining, and manufacturing hub.", lat: 47.68, lon: -116.78 },

  { city: "Chicago", regionCode: "IL", country: "US", timeZone: "America/Chicago", fact: "Finance, trading, and transportation hub.", lat: 41.88, lon: -87.63 },

  { city: "Indianapolis", regionCode: "IN", country: "US", timeZone: "America/Indianapolis", fact: "Logistics, motorsports, and life sciences hub.", lat: 39.77, lon: -86.16 },
  // A handful of northwest/southwest Indiana counties are Central Time.
  { city: "Gary", regionCode: "IN", country: "US", timeZone: "America/Chicago", fact: "Steel manufacturing and logistics hub.", lat: 41.59, lon: -87.35 },

  { city: "Des Moines", regionCode: "IA", country: "US", timeZone: "America/Chicago", fact: "Insurance and agribusiness hub.", lat: 41.59, lon: -93.62 },

  { city: "Wichita", regionCode: "KS", country: "US", timeZone: "America/Chicago", fact: "Aircraft manufacturing hub.", lat: 37.69, lon: -97.34 },
  // Western Kansas is Mountain Time.
  { city: "Goodland", regionCode: "KS", country: "US", timeZone: "America/Denver", fact: "Agriculture and grain trading hub.", lat: 39.35, lon: -101.71 },

  { city: "Louisville", regionCode: "KY", country: "US", timeZone: "America/New_York", fact: "Logistics, healthcare, and bourbon industry hub.", lat: 38.25, lon: -85.76 },
  // Western Kentucky is Central Time.
  { city: "Bowling Green", regionCode: "KY", country: "US", timeZone: "America/Chicago", fact: "Automotive manufacturing hub.", lat: 36.99, lon: -86.44 },

  { city: "New Orleans", regionCode: "LA", country: "US", timeZone: "America/Chicago", fact: "Shipping, energy, and tourism hub.", lat: 29.95, lon: -90.07 },

  { city: "Portland", regionCode: "ME", country: "US", timeZone: "America/New_York", fact: "Fishing, tourism, and healthcare hub.", lat: 43.66, lon: -70.26 },

  { city: "Baltimore", regionCode: "MD", country: "US", timeZone: "America/New_York", fact: "Shipping, healthcare, and finance hub.", lat: 39.29, lon: -76.61 },

  { city: "Boston", regionCode: "MA", country: "US", timeZone: "America/New_York", fact: "Biotech, education, and finance hub.", lat: 42.36, lon: -71.06 },

  { city: "Detroit", regionCode: "MI", country: "US", timeZone: "America/Detroit", fact: "Automotive manufacturing and mobility tech hub.", lat: 42.33, lon: -83.05 },
  // The western Upper Peninsula is Central Time.
  { city: "Ironwood", regionCode: "MI", country: "US", timeZone: "America/Menominee", fact: "Forestry and tourism hub.", lat: 46.45, lon: -90.17 },

  { city: "Minneapolis", regionCode: "MN", country: "US", timeZone: "America/Chicago", fact: "Healthcare, retail, and finance hub.", lat: 44.98, lon: -93.27 },

  { city: "Jackson", regionCode: "MS", country: "US", timeZone: "America/Chicago", fact: "Healthcare, government, and manufacturing hub.", lat: 32.30, lon: -90.18 },

  { city: "Kansas City", regionCode: "MO", country: "US", timeZone: "America/Chicago", fact: "Logistics, agribusiness, and finance hub.", lat: 39.10, lon: -94.58 },

  { city: "Billings", regionCode: "MT", country: "US", timeZone: "America/Denver", fact: "Energy, agriculture, and healthcare hub.", lat: 45.78, lon: -108.50 },

  { city: "Omaha", regionCode: "NE", country: "US", timeZone: "America/Chicago", fact: "Insurance, finance, and food processing hub.", lat: 41.26, lon: -95.94 },
  // The Nebraska Panhandle is Mountain Time.
  { city: "Scottsbluff", regionCode: "NE", country: "US", timeZone: "America/Denver", fact: "Agriculture and livestock trading hub.", lat: 41.87, lon: -103.66 },

  { city: "Las Vegas", regionCode: "NV", country: "US", timeZone: "America/Los_Angeles", fact: "Tourism, hospitality, and entertainment hub.", lat: 36.17, lon: -115.14 },

  { city: "Manchester", regionCode: "NH", country: "US", timeZone: "America/New_York", fact: "Healthcare, manufacturing, and technology hub.", lat: 42.99, lon: -71.46 },

  { city: "Newark", regionCode: "NJ", country: "US", timeZone: "America/New_York", fact: "Shipping, logistics, and finance hub.", lat: 40.74, lon: -74.17 },

  { city: "Albuquerque", regionCode: "NM", country: "US", timeZone: "America/Denver", fact: "Aerospace, defense, and research hub.", lat: 35.08, lon: -106.65 },

  { city: "New York City", regionCode: "NY", country: "US", timeZone: "America/New_York", fact: "Global finance, media, and corporate headquarters hub.", lat: 40.71, lon: -74.01 },

  { city: "Charlotte", regionCode: "NC", country: "US", timeZone: "America/New_York", fact: "Banking and finance headquarters hub.", lat: 35.23, lon: -80.84 },

  { city: "Fargo", regionCode: "ND", country: "US", timeZone: "America/Chicago", fact: "Agriculture, technology, and finance hub.", lat: 46.88, lon: -96.79 },
  // Western North Dakota (around Williston) is Mountain Time.
  { city: "Williston", regionCode: "ND", country: "US", timeZone: "America/Denver", fact: "Oil and gas production hub.", lat: 48.15, lon: -103.62 },

  { city: "Columbus", regionCode: "OH", country: "US", timeZone: "America/New_York", fact: "Insurance, logistics, and technology hub.", lat: 39.96, lon: -83.00 },

  { city: "Oklahoma City", regionCode: "OK", country: "US", timeZone: "America/Chicago", fact: "Energy and aviation manufacturing hub.", lat: 35.47, lon: -97.52 },

  { city: "Portland", regionCode: "OR", country: "US", timeZone: "America/Los_Angeles", fact: "Technology, apparel, and manufacturing hub.", lat: 45.52, lon: -122.68 },
  // Malheur County (around Ontario, OR) is Mountain Time.
  { city: "Ontario", regionCode: "OR", country: "US", timeZone: "America/Boise", fact: "Agriculture and food processing hub.", lat: 44.03, lon: -116.96 },

  { city: "Philadelphia", regionCode: "PA", country: "US", timeZone: "America/New_York", fact: "Healthcare, finance, and education hub.", lat: 39.95, lon: -75.16 },

  { city: "Providence", regionCode: "RI", country: "US", timeZone: "America/New_York", fact: "Healthcare, education, and jewelry manufacturing hub.", lat: 41.82, lon: -71.41 },

  { city: "Charleston", regionCode: "SC", country: "US", timeZone: "America/New_York", fact: "Shipping, aerospace, and tourism hub.", lat: 32.78, lon: -79.93 },

  { city: "Sioux Falls", regionCode: "SD", country: "US", timeZone: "America/Chicago", fact: "Banking and finance hub.", lat: 43.55, lon: -96.73 },
  // Western South Dakota is Mountain Time.
  { city: "Rapid City", regionCode: "SD", country: "US", timeZone: "America/Denver", fact: "Tourism and defense hub.", lat: 44.08, lon: -103.23 },

  // Tennessee splits roughly down the middle: Nashville/Memphis are
  // Central, Knoxville/Chattanooga are Eastern.
  { city: "Nashville", regionCode: "TN", country: "US", timeZone: "America/Chicago", fact: "Music industry, healthcare, and tourism hub.", lat: 36.16, lon: -86.78 },
  { city: "Knoxville", regionCode: "TN", country: "US", timeZone: "America/New_York", fact: "Energy research and manufacturing hub.", lat: 35.96, lon: -83.92 },

  { city: "Houston", regionCode: "TX", country: "US", timeZone: "America/Chicago", fact: "Energy, aerospace, and shipping hub.", lat: 29.76, lon: -95.37 },
  // Far West Texas (El Paso) is Mountain Time.
  { city: "El Paso", regionCode: "TX", country: "US", timeZone: "America/Denver", fact: "Manufacturing, trade, and logistics hub.", lat: 31.76, lon: -106.49 },

  { city: "Salt Lake City", regionCode: "UT", country: "US", timeZone: "America/Denver", fact: "Finance, technology, and outdoor recreation hub.", lat: 40.76, lon: -111.89 },

  { city: "Burlington", regionCode: "VT", country: "US", timeZone: "America/New_York", fact: "Healthcare, technology, and tourism hub.", lat: 44.48, lon: -73.21 },

  { city: "Virginia Beach", regionCode: "VA", country: "US", timeZone: "America/New_York", fact: "Defense, tourism, and logistics hub.", lat: 36.85, lon: -75.98 },

  { city: "Seattle", regionCode: "WA", country: "US", timeZone: "America/Los_Angeles", fact: "Technology, aerospace, and e-commerce hub.", lat: 47.61, lon: -122.33 },

  { city: "Charleston", regionCode: "WV", country: "US", timeZone: "America/New_York", fact: "Chemical manufacturing and government hub.", lat: 38.35, lon: -81.63 },

  { city: "Milwaukee", regionCode: "WI", country: "US", timeZone: "America/Chicago", fact: "Manufacturing and financial services hub.", lat: 43.04, lon: -87.91 },

  { city: "Cheyenne", regionCode: "WY", country: "US", timeZone: "America/Denver", fact: "Energy, government, and rail logistics hub.", lat: 41.14, lon: -104.82 },
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
