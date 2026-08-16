// Small skyline illustration for each Market Snapshot card. Deliberately
// a procedurally generated inline SVG, not a fetched photo: every city
// always renders something (no broken-image state to handle, no network
// request, no per-image licensing to track down for 90+ cities), and the
// silhouette is seeded from the city's own name so the same city always
// looks the same while different cities look distinct from one another.
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(hash, 31) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// Deterministic PRNG (mulberry32) seeded from the hash above - same
// input seed always produces the same sequence, unlike Math.random().
function createRandom(seed: number): () => number {
  let state = seed;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIEW_WIDTH = 300;
const VIEW_HEIGHT = 60;

function buildSkyline(seed: string) {
  const random = createRandom(hashString(seed));
  const buildings: { x: number; width: number; height: number; opacity: number; window: boolean }[] = [];

  let x = -4;
  while (x < VIEW_WIDTH + 4) {
    const width = 14 + Math.floor(random() * 16);
    const height = 18 + Math.floor(random() * 36);
    buildings.push({
      x,
      width,
      height,
      opacity: 0.55 + random() * 0.4,
      window: random() > 0.55,
    });
    x += width + 1 + Math.floor(random() * 4);
  }

  return buildings;
}

export default function CitySkyline({ seed, className }: { seed: string; className?: string }) {
  const buildings = buildSkyline(seed);

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={`sky-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dbe8fb" />
          <stop offset="100%" stopColor="#f4f7fa" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#sky-${seed})`} />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={VIEW_HEIGHT - b.height}
            width={b.width}
            height={b.height}
            fill="#223a55"
            opacity={b.opacity}
          />
          {b.window && (
            <rect x={b.x + b.width / 2 - 1.5} y={VIEW_HEIGHT - b.height + 6} width={3} height={5} fill="#f4f7fa" opacity={0.55} />
          )}
        </g>
      ))}
    </svg>
  );
}
