import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FETCH_TIMEOUT_MS = 8_000;
const WEATHER_CACHE_SECONDS = 15 * 60;

function parseCoordinate(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export async function GET(request: NextRequest) {
  const latitude = parseCoordinate(request.nextUrl.searchParams.get("latitude"), -90, 90);
  const longitude = parseCoordinate(request.nextUrl.searchParams.get("longitude"), -180, 180);

  if (latitude === null || longitude === null) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }

  const upstreamUrl = new URL(OPEN_METEO_URL);
  upstreamUrl.searchParams.set("latitude", String(latitude));
  upstreamUrl.searchParams.set("longitude", String(longitude));
  upstreamUrl.searchParams.set("current", "temperature_2m,weather_code,is_day");
  upstreamUrl.searchParams.set("temperature_unit", "celsius");
  upstreamUrl.searchParams.set("timezone", "auto");

  try {
    const response = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: WEATHER_CACHE_SECONDS },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo returned ${response.status}`);
    }

    const json = await response.json();
    const current = json?.current;
    if (
      typeof current?.temperature_2m !== "number" ||
      typeof current?.weather_code !== "number" ||
      typeof current?.is_day !== "number"
    ) {
      throw new Error("Unexpected Open-Meteo response shape");
    }

    return NextResponse.json(
      {
        current: {
          temperature_2m: current.temperature_2m,
          weather_code: current.weather_code,
          is_day: current.is_day,
        },
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${WEATHER_CACHE_SECONDS}, stale-while-revalidate=3600`,
        },
      }
    );
  } catch (error) {
    console.error("Weather lookup failed", error);
    return NextResponse.json(
      { error: "Weather is temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
