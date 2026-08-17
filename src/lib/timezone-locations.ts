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
};

export const COUNTRY_NAMES: Record<LocationCountry, string> = {
  CA: "Canada",
  US: "United States",
};

export const COUNTRY_FLAGS: Record<LocationCountry, string> = {
  CA: "🇨🇦",
  US: "🇺🇸",
};

export function countryName(country: LocationCountry): string {
  return COUNTRY_NAMES[country];
}

export function countryFlag(country: LocationCountry): string {
  return COUNTRY_FLAGS[country];
}

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
  { city: "Calgary", regionCode: "AB", country: "CA", timeZone: "America/Edmonton", fact: "Energy sector hub — oil, gas, and pipeline headquarters." },
  { city: "Edmonton", regionCode: "AB", country: "CA", timeZone: "America/Edmonton", fact: "Petrochemical processing and manufacturing hub." },

  { city: "Vancouver", regionCode: "BC", country: "CA", timeZone: "America/Vancouver", fact: "Film production, technology, and Asia-Pacific trade gateway." },
  { city: "Victoria", regionCode: "BC", country: "CA", timeZone: "America/Vancouver", fact: "Government, tourism, and marine technology center." },
  { city: "Kelowna", regionCode: "BC", country: "CA", timeZone: "America/Vancouver", fact: "Wine industry, tourism, and a growing tech sector." },
  // Fort St. John / the northeast corner of B.C. stays on Mountain
  // Standard Time year-round (no DST) - the "different time rules" area
  // the panel is required to be able to represent.
  { city: "Fort St. John", regionCode: "BC", country: "CA", timeZone: "America/Dawson_Creek", fact: "Natural gas and energy services hub for northeastern B.C." },

  { city: "Winnipeg", regionCode: "MB", country: "CA", timeZone: "America/Winnipeg", fact: "Aerospace manufacturing, agribusiness, and transportation hub." },
  { city: "Brandon", regionCode: "MB", country: "CA", timeZone: "America/Winnipeg", fact: "Agriculture and food processing center." },

  { city: "Moncton", regionCode: "NB", country: "CA", timeZone: "America/Moncton", fact: "Distribution, logistics, and bilingual customer service hub." },
  { city: "Fredericton", regionCode: "NB", country: "CA", timeZone: "America/Moncton", fact: "Government, education, and cybersecurity sector." },

  { city: "St. John's", regionCode: "NL", country: "CA", timeZone: "America/St_Johns", fact: "Offshore oil and gas, and marine research hub." },
  // Labrador observes Atlantic Time, a full hour off Newfoundland Time on
  // the rest of the island - same province, different zone.
  { city: "Happy Valley-Goose Bay", regionCode: "NL", country: "CA", timeZone: "America/Goose_Bay", fact: "Defense, aviation, and regional resource services." },

  { city: "Halifax", regionCode: "NS", country: "CA", timeZone: "America/Halifax", fact: "Shipping, defense, and financial services hub." },
  { city: "Sydney", regionCode: "NS", country: "CA", timeZone: "America/Halifax", fact: "Call center services and offshore energy support." },

  { city: "Yellowknife", regionCode: "NT", country: "CA", timeZone: "America/Edmonton", fact: "Diamond mining and territorial government center." },
  { city: "Inuvik", regionCode: "NT", country: "CA", timeZone: "America/Inuvik", fact: "Arctic research and oil/gas exploration support." },

  { city: "Iqaluit", regionCode: "NU", country: "CA", timeZone: "America/Iqaluit", fact: "Territorial government and mining logistics hub." },
  { city: "Rankin Inlet", regionCode: "NU", country: "CA", timeZone: "America/Rankin_Inlet", fact: "Regional mining services and government hub." },
  { city: "Cambridge Bay", regionCode: "NU", country: "CA", timeZone: "America/Cambridge_Bay", fact: "Arctic research and marine navigation support." },

  { city: "Toronto", regionCode: "ON", country: "CA", timeZone: "America/Toronto", fact: "Canada's financial capital — banking, finance, and technology." },
  { city: "Ottawa", regionCode: "ON", country: "CA", timeZone: "America/Toronto", fact: "Federal government, technology, and defense sector hub." },
  { city: "Hamilton", regionCode: "ON", country: "CA", timeZone: "America/Toronto", fact: "Steel manufacturing and a growing healthcare sector." },
  { city: "London", regionCode: "ON", country: "CA", timeZone: "America/Toronto", fact: "Insurance, healthcare, and manufacturing hub." },

  { city: "Charlottetown", regionCode: "PE", country: "CA", timeZone: "America/Halifax", fact: "Bioscience, tourism, and government services hub." },

  { city: "Montreal", regionCode: "QC", country: "CA", timeZone: "America/Toronto", fact: "Aerospace, AI research, and finance hub." },
  { city: "Quebec City", regionCode: "QC", country: "CA", timeZone: "America/Toronto", fact: "Insurance, tourism, and provincial government hub." },

  // Saskatchewan does not observe DST - it stays on Central Standard
  // Time all year, another required regional exception.
  { city: "Regina", regionCode: "SK", country: "CA", timeZone: "America/Regina", fact: "Agriculture, potash mining, and energy hub." },
  { city: "Saskatoon", regionCode: "SK", country: "CA", timeZone: "America/Regina", fact: "Mining, agriculture technology, and biotech hub." },

  // Yukon has observed permanent Mountain Standard Time (no DST) since
  // November 2020 - the third required Canadian DST exception.
  { city: "Whitehorse", regionCode: "YT", country: "CA", timeZone: "America/Whitehorse", fact: "Mining services, tourism, and territorial government." },
  { city: "Dawson City", regionCode: "YT", country: "CA", timeZone: "America/Dawson", fact: "Gold mining heritage and tourism hub." },

  // --- United States ----------------------------------------------------
  { city: "Birmingham", regionCode: "AL", country: "US", timeZone: "America/Chicago", fact: "Banking, healthcare, and steel manufacturing hub." },

  { city: "Anchorage", regionCode: "AK", country: "US", timeZone: "America/Anchorage", fact: "Oil, transportation, and fishing industry hub." },
  { city: "Adak", regionCode: "AK", country: "US", timeZone: "America/Adak", fact: "Fishing industry and remote logistics support." },

  // Arizona does not observe DST (outside the Navajo Nation) - the
  // canonical required exception.
  { city: "Phoenix", regionCode: "AZ", country: "US", timeZone: "America/Phoenix", fact: "Semiconductor manufacturing and a growing tech sector." },

  { city: "Little Rock", regionCode: "AR", country: "US", timeZone: "America/Chicago", fact: "Distribution, healthcare, and government services hub." },

  { city: "Los Angeles", regionCode: "CA", country: "US", timeZone: "America/Los_Angeles", fact: "Entertainment, media, and international trade hub." },
  { city: "San Francisco", regionCode: "CA", country: "US", timeZone: "America/Los_Angeles", fact: "Technology, venture capital, and finance hub." },

  { city: "Denver", regionCode: "CO", country: "US", timeZone: "America/Denver", fact: "Energy, aerospace, and finance hub." },

  { city: "Hartford", regionCode: "CT", country: "US", timeZone: "America/New_York", fact: "Insurance industry headquarters hub." },

  { city: "Wilmington", regionCode: "DE", country: "US", timeZone: "America/New_York", fact: "Banking, finance, and corporate law hub." },

  { city: "Washington", regionCode: "DC", country: "US", timeZone: "America/New_York", fact: "Federal government, policy, and defense contracting hub." },

  { city: "Miami", regionCode: "FL", country: "US", timeZone: "America/New_York", fact: "International trade, finance, and tourism hub." },
  // The Florida Panhandle west of the Apalachicola River is Central Time.
  { city: "Pensacola", regionCode: "FL", country: "US", timeZone: "America/Chicago", fact: "Defense, aviation, and tourism hub." },

  { city: "Atlanta", regionCode: "GA", country: "US", timeZone: "America/New_York", fact: "Logistics, media, and corporate headquarters hub." },

  // Hawaii does not observe DST - the other canonical required exception.
  { city: "Honolulu", regionCode: "HI", country: "US", timeZone: "Pacific/Honolulu", fact: "Tourism, military, and Pacific trade hub." },

  { city: "Boise", regionCode: "ID", country: "US", timeZone: "America/Boise", fact: "Technology, agriculture, and food processing hub." },
  // The Idaho Panhandle is Pacific Time.
  { city: "Coeur d'Alene", regionCode: "ID", country: "US", timeZone: "America/Los_Angeles", fact: "Tourism, mining, and manufacturing hub." },

  { city: "Chicago", regionCode: "IL", country: "US", timeZone: "America/Chicago", fact: "Finance, trading, and transportation hub." },

  { city: "Indianapolis", regionCode: "IN", country: "US", timeZone: "America/Indianapolis", fact: "Logistics, motorsports, and life sciences hub." },
  // A handful of northwest/southwest Indiana counties are Central Time.
  { city: "Gary", regionCode: "IN", country: "US", timeZone: "America/Chicago", fact: "Steel manufacturing and logistics hub." },

  { city: "Des Moines", regionCode: "IA", country: "US", timeZone: "America/Chicago", fact: "Insurance and agribusiness hub." },

  { city: "Wichita", regionCode: "KS", country: "US", timeZone: "America/Chicago", fact: "Aircraft manufacturing hub." },
  // Western Kansas is Mountain Time.
  { city: "Goodland", regionCode: "KS", country: "US", timeZone: "America/Denver", fact: "Agriculture and grain trading hub." },

  { city: "Louisville", regionCode: "KY", country: "US", timeZone: "America/New_York", fact: "Logistics, healthcare, and bourbon industry hub." },
  // Western Kentucky is Central Time.
  { city: "Bowling Green", regionCode: "KY", country: "US", timeZone: "America/Chicago", fact: "Automotive manufacturing hub." },

  { city: "New Orleans", regionCode: "LA", country: "US", timeZone: "America/Chicago", fact: "Shipping, energy, and tourism hub." },

  { city: "Portland", regionCode: "ME", country: "US", timeZone: "America/New_York", fact: "Fishing, tourism, and healthcare hub." },

  { city: "Baltimore", regionCode: "MD", country: "US", timeZone: "America/New_York", fact: "Shipping, healthcare, and finance hub." },

  { city: "Boston", regionCode: "MA", country: "US", timeZone: "America/New_York", fact: "Biotech, education, and finance hub." },

  { city: "Detroit", regionCode: "MI", country: "US", timeZone: "America/Detroit", fact: "Automotive manufacturing and mobility tech hub." },
  // The western Upper Peninsula is Central Time.
  { city: "Ironwood", regionCode: "MI", country: "US", timeZone: "America/Menominee", fact: "Forestry and tourism hub." },

  { city: "Minneapolis", regionCode: "MN", country: "US", timeZone: "America/Chicago", fact: "Healthcare, retail, and finance hub." },

  { city: "Jackson", regionCode: "MS", country: "US", timeZone: "America/Chicago", fact: "Healthcare, government, and manufacturing hub." },

  { city: "Kansas City", regionCode: "MO", country: "US", timeZone: "America/Chicago", fact: "Logistics, agribusiness, and finance hub." },

  { city: "Billings", regionCode: "MT", country: "US", timeZone: "America/Denver", fact: "Energy, agriculture, and healthcare hub." },

  { city: "Omaha", regionCode: "NE", country: "US", timeZone: "America/Chicago", fact: "Insurance, finance, and food processing hub." },
  // The Nebraska Panhandle is Mountain Time.
  { city: "Scottsbluff", regionCode: "NE", country: "US", timeZone: "America/Denver", fact: "Agriculture and livestock trading hub." },

  { city: "Las Vegas", regionCode: "NV", country: "US", timeZone: "America/Los_Angeles", fact: "Tourism, hospitality, and entertainment hub." },

  { city: "Manchester", regionCode: "NH", country: "US", timeZone: "America/New_York", fact: "Healthcare, manufacturing, and technology hub." },

  { city: "Newark", regionCode: "NJ", country: "US", timeZone: "America/New_York", fact: "Shipping, logistics, and finance hub." },

  { city: "Albuquerque", regionCode: "NM", country: "US", timeZone: "America/Denver", fact: "Aerospace, defense, and research hub." },

  { city: "New York City", regionCode: "NY", country: "US", timeZone: "America/New_York", fact: "Global finance, media, and corporate headquarters hub." },

  { city: "Charlotte", regionCode: "NC", country: "US", timeZone: "America/New_York", fact: "Banking and finance headquarters hub." },

  { city: "Fargo", regionCode: "ND", country: "US", timeZone: "America/Chicago", fact: "Agriculture, technology, and finance hub." },
  // Western North Dakota (around Williston) is Mountain Time.
  { city: "Williston", regionCode: "ND", country: "US", timeZone: "America/Denver", fact: "Oil and gas production hub." },

  { city: "Columbus", regionCode: "OH", country: "US", timeZone: "America/New_York", fact: "Insurance, logistics, and technology hub." },

  { city: "Oklahoma City", regionCode: "OK", country: "US", timeZone: "America/Chicago", fact: "Energy and aviation manufacturing hub." },

  { city: "Portland", regionCode: "OR", country: "US", timeZone: "America/Los_Angeles", fact: "Technology, apparel, and manufacturing hub." },
  // Malheur County (around Ontario, OR) is Mountain Time.
  { city: "Ontario", regionCode: "OR", country: "US", timeZone: "America/Boise", fact: "Agriculture and food processing hub." },

  { city: "Philadelphia", regionCode: "PA", country: "US", timeZone: "America/New_York", fact: "Healthcare, finance, and education hub." },

  { city: "Providence", regionCode: "RI", country: "US", timeZone: "America/New_York", fact: "Healthcare, education, and jewelry manufacturing hub." },

  { city: "Charleston", regionCode: "SC", country: "US", timeZone: "America/New_York", fact: "Shipping, aerospace, and tourism hub." },

  { city: "Sioux Falls", regionCode: "SD", country: "US", timeZone: "America/Chicago", fact: "Banking and finance hub." },
  // Western South Dakota is Mountain Time.
  { city: "Rapid City", regionCode: "SD", country: "US", timeZone: "America/Denver", fact: "Tourism and defense hub." },

  // Tennessee splits roughly down the middle: Nashville/Memphis are
  // Central, Knoxville/Chattanooga are Eastern.
  { city: "Nashville", regionCode: "TN", country: "US", timeZone: "America/Chicago", fact: "Music industry, healthcare, and tourism hub." },
  { city: "Knoxville", regionCode: "TN", country: "US", timeZone: "America/New_York", fact: "Energy research and manufacturing hub." },

  { city: "Houston", regionCode: "TX", country: "US", timeZone: "America/Chicago", fact: "Energy, aerospace, and shipping hub." },
  // Far West Texas (El Paso) is Mountain Time.
  { city: "El Paso", regionCode: "TX", country: "US", timeZone: "America/Denver", fact: "Manufacturing, trade, and logistics hub." },

  { city: "Salt Lake City", regionCode: "UT", country: "US", timeZone: "America/Denver", fact: "Finance, technology, and outdoor recreation hub." },

  { city: "Burlington", regionCode: "VT", country: "US", timeZone: "America/New_York", fact: "Healthcare, technology, and tourism hub." },

  { city: "Virginia Beach", regionCode: "VA", country: "US", timeZone: "America/New_York", fact: "Defense, tourism, and logistics hub." },

  { city: "Seattle", regionCode: "WA", country: "US", timeZone: "America/Los_Angeles", fact: "Technology, aerospace, and e-commerce hub." },

  { city: "Charleston", regionCode: "WV", country: "US", timeZone: "America/New_York", fact: "Chemical manufacturing and government hub." },

  { city: "Milwaukee", regionCode: "WI", country: "US", timeZone: "America/Chicago", fact: "Manufacturing and financial services hub." },

  { city: "Cheyenne", regionCode: "WY", country: "US", timeZone: "America/Denver", fact: "Energy, government, and rail logistics hub." },
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
