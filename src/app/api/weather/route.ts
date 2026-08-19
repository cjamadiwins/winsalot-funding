import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { findCity, type LocationCountry } from "@/lib/timezone-locations";
import { getWeatherForCity, type WeatherResult } from "@/lib/weather";

export const runtime = "nodejs";

// Backs the weather block on every "Client Local Time" card (Cleaning +
// Lead Gen CRMs share the one panel component - see
// ClientLocalTimePanel.tsx, the only client of this route). Deliberately
// takes {country, regionCode, city} rather than raw lat/lon: the real
// coordinates are always re-derived here from the canonical CITIES table
// (timezone-locations.ts), the same "never trust client-supplied
// location data" pattern the time zone itself already uses
// (resolveLocation) - so this can only ever proxy OpenWeatherMap for one
// of our own ~94 known cities, never an arbitrary point a caller could
// use this as a free weather proxy for.
//
// Not in src/proxy.ts's middleware matcher (that only covers page
// routes), so the session check below is this route's only gate -
// any signed-in user of either CRM, not a specific role, since weather
// isn't sensitive data and both CRMs' dashboards render this same panel.
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Not signed in." } satisfies WeatherResult, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const regionCode = searchParams.get("regionCode");
  const city = searchParams.get("city");

  if ((country !== "CA" && country !== "US") || !regionCode || !city) {
    return NextResponse.json({ error: "Invalid location." } satisfies WeatherResult, { status: 400 });
  }

  const match = findCity(country as LocationCountry, regionCode, city);
  if (!match) {
    return NextResponse.json({ error: "Unknown location." } satisfies WeatherResult, { status: 400 });
  }

  const result = await getWeatherForCity(match.lat, match.lon, match.timeZone);
  return NextResponse.json(result satisfies WeatherResult, { status: "error" in result ? 502 : 200 });
}
