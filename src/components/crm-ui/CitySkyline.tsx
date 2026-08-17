// Skyline illustration for each Market Snapshot card. Deliberately a
// hand-authored, procedurally-laid-out inline SVG, not a fetched photo:
// every city always renders something (no broken-image state, no network
// request, no per-image licensing to track down for 90+ cities), and the
// layout is seeded from the city's own name so the same city always
// looks the same while different cities look distinct.
//
// A handful of major cities (Toronto, Vancouver, and a dozen others -
// see skylines/scenes.tsx) get hand-drawn recognizable artwork (CN
// Tower, Space Needle, mountains behind Vancouver, ...); every other
// city gets a detailed generic North American skyline built from the
// same reusable building/window pieces. Colours (not geometry) swap
// between a daytime and a night palette based on the selected city's
// own local hour, so the illustration reflects whether it's actually
// day or night there right now.
import { hashString } from "./skylines/random";
import { DAY_PALETTE, NIGHT_PALETTE, isNightHour } from "./skylines/palette";
import { VIEW_WIDTH, VIEW_HEIGHT } from "./skylines/viewport";
import { Stars } from "./skylines/pieces";
import { CUSTOM_SCENES, GenericSkyline } from "./skylines/scenes";

export function isNightAt(date: Date, timeZone: string): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date)
  );
  return isNightHour(hour);
}

export default function CitySkyline({ seed, night, className }: { seed: string; night: boolean; className?: string }) {
  const palette = night ? NIGHT_PALETTE : DAY_PALETTE;
  const Scene = CUSTOM_SCENES[seed] ?? GenericSkyline;
  // SVG `id`/`url(#id)` references must be well-formed CSS identifiers -
  // a raw city-name seed like "US-NY-New York City" contains spaces that
  // break the url() fragment syntax (the browser can't parse it and
  // falls back to fill's initial value, which is *black*, silently
  // painting the whole card night-black in the middle of the day). A
  // short hashed, alphanumeric-only token sidesteps that entirely while
  // staying stable per seed.
  const domId = hashString(`${seed}-${night}`).toString(36);

  return (
    <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="none" role="presentation" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`sky-${domId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.skyTop} />
          <stop offset="100%" stopColor={palette.skyBottom} />
        </linearGradient>
        <radialGradient id={`glow-${domId}`} cx="50%" cy="100%" r="75%">
          <stop offset="0%" stopColor={palette.skyGlow} stopOpacity={night ? 0.35 : 0.5} />
          <stop offset="100%" stopColor={palette.skyGlow} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#sky-${domId})`} />
      <Stars seed={`${seed}-stars`} count={18} width={VIEW_WIDTH} height={VIEW_HEIGHT} opacity={palette.starOpacity} />
      <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#glow-${domId})`} />
      <Scene palette={palette} seed={seed} />
    </svg>
  );
}
