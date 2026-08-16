"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import {
  DEFAULT_LOCATION_1,
  DEFAULT_LOCATION_2,
  resolveLocation,
  type LocationCountry,
  type SavedLocation,
} from "./timezone-locations";

export type TimeZonePreferences = {
  location1: SavedLocation;
  location2: SavedLocation;
};

type PreferencesRow = {
  location_1_country: string;
  location_1_region_code: string;
  location_1_city: string;
  location_1_time_zone: string;
  location_2_country: string;
  location_2_region_code: string;
  location_2_city: string;
  location_2_time_zone: string;
};

function rowToPreferences(row: PreferencesRow | null): TimeZonePreferences {
  if (!row) {
    return { location1: DEFAULT_LOCATION_1, location2: DEFAULT_LOCATION_2 };
  }
  return {
    location1: {
      country: row.location_1_country as LocationCountry,
      regionCode: row.location_1_region_code,
      city: row.location_1_city,
      timeZone: row.location_1_time_zone,
    },
    location2: {
      country: row.location_2_country as LocationCountry,
      regionCode: row.location_2_region_code,
      city: row.location_2_city,
      timeZone: row.location_2_time_zone,
    },
  };
}

// Reads the signed-in user's saved Client Local Time locations, falling
// back to the Toronto/Vancouver defaults if they're not signed in or
// don't have a row yet (new accounts created after the backfill
// migration only get a row once they save or reset). Never throws - the
// panel should always have something reasonable to render.
export async function getUserTimeZonePreferences(): Promise<TimeZonePreferences> {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return { location1: DEFAULT_LOCATION_1, location2: DEFAULT_LOCATION_2 };
  }

  const { data } = await supabase
    .from("user_time_zone_preferences")
    .select(
      "location_1_country, location_1_region_code, location_1_city, location_1_time_zone, location_2_country, location_2_region_code, location_2_city, location_2_time_zone"
    )
    .eq("user_id", authData.user.id)
    .maybeSingle();

  return rowToPreferences(data as PreferencesRow | null);
}

export type SaveTimeZonePreferencesResult = { error?: string };

// Persists the two locations the user picked in "Edit Locations". Only
// {country, region, city} come from the client - the time zone is always
// re-derived from timezone-locations.ts here, never trusted from the
// request, so a tampered call can only ever select a real, valid
// location from the canonical list, never an arbitrary time zone string.
export async function saveUserTimeZonePreferences(
  location1: { country: LocationCountry; regionCode: string; city: string },
  location2: { country: LocationCountry; regionCode: string; city: string }
): Promise<SaveTimeZonePreferencesResult> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { error: "You must be signed in to save Client Local Time locations." };
  }

  const resolved1 = resolveLocation(location1.country, location1.regionCode, location1.city);
  const resolved2 = resolveLocation(location2.country, location2.regionCode, location2.city);
  if (!resolved1 || !resolved2) {
    return { error: "Choose a valid country, province/state, and city for both locations." };
  }

  const { error } = await supabase.from("user_time_zone_preferences").upsert({
    user_id: authData.user.id,
    location_1_country: resolved1.country,
    location_1_region_code: resolved1.regionCode,
    location_1_city: resolved1.city,
    location_1_time_zone: resolved1.timeZone,
    location_2_country: resolved2.country,
    location_2_region_code: resolved2.regionCode,
    location_2_city: resolved2.city,
    location_2_time_zone: resolved2.timeZone,
  });

  if (error) {
    return { error: "Failed to save your Client Local Time locations. Please try again." };
  }

  revalidatePath("/", "layout");
  return {};
}

// "Reset to Toronto & Vancouver" - restores the original defaults.
export async function resetUserTimeZonePreferences(): Promise<SaveTimeZonePreferencesResult> {
  return saveUserTimeZonePreferences(
    { country: DEFAULT_LOCATION_1.country, regionCode: DEFAULT_LOCATION_1.regionCode, city: DEFAULT_LOCATION_1.city },
    { country: DEFAULT_LOCATION_2.country, regionCode: DEFAULT_LOCATION_2.regionCode, city: DEFAULT_LOCATION_2.city }
  );
}
