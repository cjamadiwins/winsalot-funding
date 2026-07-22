import type { TargetIndustry } from "./types";

// Maps each target industry to OpenStreetMap tag filters (Overpass QL
// fragments, e.g. `["amenity"="clinic"]`) used by the qualified-prospects
// connector. OSM has no dedicated tag for a couple of the brief's target
// industries - "Property management" and "Office building management"
// companies aren't reliably distinguishable from generic offices in OSM's
// tagging scheme, so they're intentionally left out here rather than
// mapped to a guess that would mostly return noise. That's a known
// coverage gap, not an oversight - see docs/active-cleaning-opportunities.md.
export type IndustryOsmMapping = {
  industry: TargetIndustry;
  filters: string[];
};

export const INDUSTRY_OSM_MAPPINGS: IndustryOsmMapping[] = [
  { industry: "Medical clinic", filters: ['["amenity"="clinic"]', '["amenity"="doctors"]'] },
  { industry: "Dental office", filters: ['["amenity"="dentist"]'] },
  { industry: "Daycare", filters: ['["amenity"="childcare"]', '["amenity"="kindergarten"]'] },
  { industry: "Private school", filters: ['["amenity"="school"]["fee"="yes"]'] },
  { industry: "Warehouse", filters: ['["building"="warehouse"]'] },
  { industry: "Distribution centre", filters: ['["industrial"="warehouse"]'] },
  { industry: "Restaurant", filters: ['["amenity"="restaurant"]'] },
  { industry: "Gym", filters: ['["leisure"="fitness_centre"]'] },
  { industry: "Car dealership", filters: ['["shop"="car"]'] },
  { industry: "Retail store", filters: ['["shop"="department_store"]', '["shop"="mall"]'] },
  {
    industry: "Professional office",
    filters: ['["office"="lawyer"]', '["office"="accountant"]', '["office"="company"]'],
  },
  { industry: "Retirement residence", filters: ['["amenity"="nursing_home"]', '["social_facility"="assisted_living"]'] },
  {
    industry: "Church / community centre",
    filters: ['["amenity"="place_of_worship"]', '["amenity"="community_centre"]'],
  },
];

// Rough bounding boxes (south, west, north, east) covering every target
// city in each region with margin - Overpass bbox filtering, not a
// city-name guess. A result is only ever kept if it separately has a
// structured addr:city tag matching one of the 29 target cities (see the
// qualified-prospects connector) - the bbox is just what keeps the query
// itself a manageable size, not what decides which city a record gets.
export const PROSPECT_REGIONS = [
  { name: "Metro Vancouver / Lower Mainland", bbox: "49.0,-123.3,49.4,-122.4" },
  { name: "Greater Toronto Area", bbox: "43.3,-80.2,44.3,-78.6" },
];
