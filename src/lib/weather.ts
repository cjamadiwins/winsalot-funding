import "server-only";

// Live local weather for each "Client Local Time" card (Cleaning + Lead
// Gen CRMs share the one panel component, so this one module backs both -
// see src/components/crm-ui/ClientLocalTimePanel.tsx and
// src/app/api/weather/route.ts, the only caller). Talks to OpenWeatherMap
// directly with fetch (same pattern as lib/twilio.ts) rather than pulling
// in their SDK for two endpoints.
//
// Caching: every fetch() call below passes `next: { revalidate: 1800 }`
// (30 minutes), Next.js's own Data Cache - on Vercel this is shared
// across every server instance and every user's browser tab, so no
// matter how many admins/agents have a given city's card open, at most
// one real OpenWeatherMap request per city per 30-minute window ever
// leaves this server. That's what keeps both API usage and Vercel
// function invocations bounded - not a bespoke cache table.

const OPENWEATHERMAP_BASE_URL = "https://api.openweathermap.org/data/2.5";
const CACHE_SECONDS = 1800;

export type WeatherIconKind =
  | "sun"
  | "moon"
  | "partly-cloudy-day"
  | "partly-cloudy-night"
  | "cloudy"
  | "drizzle"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "fog"
  | "wind";

export type WeatherData = {
  condition: string;
  icon: WeatherIconKind;
  tempC: number;
  feelsLikeC: number;
  highC: number;
  lowC: number;
  // ISO timestamp of when this reading was fetched from OpenWeatherMap
  // (not necessarily "now" - a cached response reflects when the cache
  // entry was populated, which is exactly what a "Last updated" label
  // should show).
  observedAt: string;
};

export type WeatherResult = { data: WeatherData } | { error: string };

// OpenWeatherMap's `weather[0].id` groups (https://openweathermap.org/weather-conditions)
// mapped to one plain-language condition label and one icon this app
// actually draws (ClientLocalTimePanel.tsx) - deliberately a small, fixed
// vocabulary rather than surfacing OpenWeatherMap's ~50 raw condition
// strings, so every card's weather reads consistently.
function mapCondition(id: number, iconCode: string): { condition: string; icon: WeatherIconKind } {
  const isNight = iconCode.endsWith("n");

  if (id === 800) return isNight ? { condition: "Clear", icon: "moon" } : { condition: "Sunny", icon: "sun" };
  if (id === 801) return { condition: "Mostly Sunny", icon: isNight ? "partly-cloudy-night" : "partly-cloudy-day" };
  if (id === 802) return { condition: "Partly Cloudy", icon: isNight ? "partly-cloudy-night" : "partly-cloudy-day" };
  if (id === 803) return { condition: "Cloudy", icon: "cloudy" };
  if (id === 804) return { condition: "Overcast", icon: "cloudy" };
  if (id >= 200 && id < 300) return { condition: "Thunderstorms", icon: "thunderstorm" };
  if (id >= 300 && id < 400) return { condition: "Drizzle", icon: "drizzle" };
  if (id >= 500 && id < 600) return { condition: "Rainy", icon: "rain" };
  if (id >= 600 && id < 700) return { condition: "Snowing", icon: "snow" };
  if (id === 771 || id === 781) return { condition: "Windy", icon: "wind" };
  if (id >= 700 && id < 800) return { condition: "Foggy", icon: "fog" };
  return { condition: "Unknown", icon: "cloudy" };
}

type OwmCurrentResponse = {
  weather: { id: number; icon: string }[];
  main: { temp: number; feels_like: number; temp_min: number; temp_max: number };
};

type OwmForecastResponse = {
  list: { dt: number; main: { temp_min: number; temp_max: number } }[];
};

// "YYYY-MM-DD" in the given IANA time zone - used to pick out which
// forecast buckets count as "today" at the city itself, not wherever this
// server happens to run.
function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Fetches current conditions + today's high/low for one city. `timeZone`
// is only used to figure out which forecast entries fall on "today" at
// that city - never trusted for anything security-sensitive (this module
// has no concept of who's asking).
//
// Today's high/low is a best-effort read, not a true full-day min/max:
// OpenWeatherMap's free tier has no "today so far" endpoint, only a
// forward-looking 3-hour forecast, so a morning high that's already
// passed by the time someone opens the card in the afternoon won't be
// reflected. To keep the range honest at minimum, it always includes the
// live current reading, then widens with whatever's still forecast for
// the rest of today.
export async function getWeatherForCity(lat: number, lon: number, timeZone: string): Promise<WeatherResult> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    return { error: "Weather service is not configured." };
  }

  try {
    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(`${OPENWEATHERMAP_BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`, {
        next: { revalidate: CACHE_SECONDS },
      }),
      fetch(`${OPENWEATHERMAP_BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`, {
        next: { revalidate: CACHE_SECONDS },
      }),
    ]);

    if (!currentResponse.ok) {
      return { error: `Weather service returned an error (${currentResponse.status}).` };
    }
    const current = (await currentResponse.json()) as OwmCurrentResponse;
    const weather = current.weather?.[0];
    if (!weather || !current.main) {
      return { error: "Weather service returned an unexpected response." };
    }

    const { condition, icon } = mapCondition(weather.id, weather.icon);

    let lowC = current.main.temp;
    let highC = current.main.temp;

    // Forecast is best-effort - if it fails, still show current
    // conditions rather than the entire card going to the fallback
    // message over a secondary call.
    if (forecastResponse.ok) {
      const forecast = (await forecastResponse.json()) as OwmForecastResponse;
      const now = new Date();
      const today = localDateKey(now, timeZone);
      for (const entry of forecast.list ?? []) {
        if (localDateKey(new Date(entry.dt * 1000), timeZone) !== today) continue;
        lowC = Math.min(lowC, entry.main.temp_min);
        highC = Math.max(highC, entry.main.temp_max);
      }
    }

    return {
      data: {
        condition,
        icon,
        tempC: current.main.temp,
        feelsLikeC: current.main.feels_like,
        highC,
        lowC,
        observedAt: new Date().toISOString(),
      },
    };
  } catch {
    return { error: "Could not reach the weather service." };
  }
}
