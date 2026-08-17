import type { ReactNode } from "react";
import type { SkyPalette } from "./palette";
import { hashString, createRandom } from "./random";

// Reusable, hand-authored SVG pieces every skyline scene is composed from:
// a generic office-tower Building in a few silhouette variants (with a
// real window grid, some lit at night), background MountainRange/Hill
// terrain, a PalmTree for warm-climate cities, and a handful of named
// landmark silhouettes (CN Tower, Space Needle, ...) used only by the
// specific cities they belong to. Everything is plain geometry (rect/
// polygon/path) - no photos, no external assets, so it's always
// available and never a broken-image state.

export type BuildingVariant = "block" | "tapered" | "stepped" | "spired" | "pyramid";

export type BuildingSpec = {
  x: number;
  width: number;
  height: number;
  variant: BuildingVariant;
};

// Deterministic "roughly how tall/wide should the next building be, and
// what shape" generator used both by the plain generic skyline and to
// fill in the space around a city's custom landmark.
export function generateBuildingRow(
  random: () => number,
  {
    startX,
    endX,
    minHeight,
    maxHeight,
    variants = ["block", "tapered", "stepped", "spired", "pyramid"],
  }: { startX: number; endX: number; minHeight: number; maxHeight: number; variants?: BuildingVariant[] }
): BuildingSpec[] {
  const buildings: BuildingSpec[] = [];
  let x = startX;
  while (x < endX) {
    const width = 12 + Math.floor(random() * 14);
    const height = minHeight + Math.floor(random() * (maxHeight - minHeight));
    const variant = variants[Math.floor(random() * variants.length)];
    buildings.push({ x, width, height, variant });
    x += width + 2 + Math.floor(random() * 4);
  }
  return buildings;
}

function buildingOutline(spec: BuildingSpec, groundY: number): { path: string; roofTierY: number } {
  const { x, width, height, variant } = spec;
  const top = groundY - height;

  switch (variant) {
    case "tapered": {
      const inset = width * 0.16;
      return {
        path: `M ${x} ${groundY} L ${x} ${top + height * 0.12} L ${x + inset} ${top} L ${x + width - inset} ${top} L ${x + width} ${top + height * 0.12} L ${x + width} ${groundY} Z`,
        roofTierY: top,
      };
    }
    case "stepped": {
      const tierW = width * 0.58;
      const tierH = height * 0.16;
      return {
        path: `M ${x} ${groundY} L ${x} ${top + tierH} L ${x + (width - tierW) / 2} ${top + tierH} L ${x + (width - tierW) / 2} ${top} L ${x + (width + tierW) / 2} ${top} L ${x + (width + tierW) / 2} ${top + tierH} L ${x + width} ${top + tierH} L ${x + width} ${groundY} Z`,
        roofTierY: top,
      };
    }
    case "pyramid": {
      const shoulderY = top + height * 0.22;
      return {
        path: `M ${x} ${groundY} L ${x} ${shoulderY} L ${x + width / 2} ${top} L ${x + width} ${shoulderY} L ${x + width} ${groundY} Z`,
        roofTierY: top,
      };
    }
    case "spired":
    case "block":
    default:
      return {
        path: `M ${x} ${groundY} L ${x} ${top} L ${x + width} ${top} L ${x + width} ${groundY} Z`,
        roofTierY: top,
      };
  }
}

// A single office tower: silhouette (per variant) plus a real window
// grid. Some windows are lit (seeded, so stable per render) - the ratio
// is 0 during the day (plain glass sheen only) and meaningfully >0 at
// night, which is what actually reads as "day vs. night" at a glance.
//
// `windowSeed` (not a shared random-number-generator instance) is
// deliberate: this component creates its own fresh, local generator from
// that string every time it renders, so the result is identical no
// matter how many times or in what order React ends up calling it -
// React (React 19's Strict Mode double-invoking components in
// development to surface impure renders, and concurrent rendering
// discarding/redoing work in general) does not guarantee a component
// only renders once, or that siblings render in a fixed relative order.
// A single mutable random() shared across many separately-rendered
// components does not survive that - each extra/reordered invocation
// permanently shifts the shared sequence, which is exactly what caused a
// real client/server hydration mismatch here during testing.
export function Building({
  spec,
  groundY,
  palette,
  litRatio,
  windowSeed,
  opacity = 1,
}: {
  spec: BuildingSpec;
  groundY: number;
  palette: SkyPalette;
  litRatio: number;
  windowSeed: string;
  opacity?: number;
}) {
  const { x, width, height, variant } = spec;
  const top = groundY - height;
  const { path } = buildingOutline(spec, groundY);
  const random = createRandom(hashString(windowSeed));

  const cols = Math.max(1, Math.round(width / 7));
  const rows = Math.max(2, Math.round(height / 9));
  const colGap = width / (cols + 1);
  const rowGap = height / (rows + 1);
  const winW = 1.5;
  const winH = 2.3;
  // Windows stay clear of the tapered/pyramid roofline by starting one
  // row down from the very top.
  const rowStart = variant === "tapered" || variant === "pyramid" ? 1 : 0;

  const windows: ReactNode[] = [];
  for (let r = rowStart; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x + colGap * (c + 1) - winW / 2;
      const wy = top + rowGap * (r + 1) - winH / 2;
      const lit = random() < litRatio;
      windows.push(
        <rect
          key={`${r}-${c}`}
          x={wx}
          y={wy}
          width={winW}
          height={winH}
          fill={lit ? palette.windowLit : palette.windowUnlit}
          opacity={lit ? palette.windowLitOpacity : palette.windowUnlitOpacity}
        />
      );
    }
  }

  return (
    <g opacity={opacity}>
      <path d={path} fill={opacity < 1 ? palette.buildingFar : palette.buildingNear} stroke={palette.buildingLine} strokeWidth={0.4} strokeOpacity={0.35} />
      {variant === "spired" && (
        <line x1={x + width / 2} y1={top} x2={x + width / 2} y2={top - height * 0.16} stroke={palette.buildingLine} strokeWidth={0.8} />
      )}
      {windows}
    </g>
  );
}

export function MountainRange({
  peaks,
  groundY,
  fill,
  opacity = 1,
  snowCapAt,
}: {
  peaks: [number, number][];
  groundY: number;
  fill: string;
  opacity?: number;
  snowCapAt?: number; // index of the peak to give a small snow cap
}) {
  const points = [`${peaks[0][0]},${groundY}`, ...peaks.map(([x, y]) => `${x},${y}`), `${peaks[peaks.length - 1][0]},${groundY}`].join(" ");
  return (
    <g opacity={opacity}>
      <polygon points={points} fill={fill} />
      {snowCapAt !== undefined && peaks[snowCapAt] && (
        <polygon
          points={`${peaks[snowCapAt][0] - 4},${peaks[snowCapAt][1] + 4} ${peaks[snowCapAt][0]},${peaks[snowCapAt][1]} ${peaks[snowCapAt][0] + 4},${peaks[snowCapAt][1] + 4}`}
          fill="#f4f7fa"
          opacity={0.85}
        />
      )}
    </g>
  );
}

export function VolcanicCrater({ x, baseY, width = 70, height = 22, fill }: { x: number; baseY: number; width?: number; height?: number; fill: string }) {
  return (
    <polygon
      fill={fill}
      points={`${x - width / 2},${baseY} ${x - width * 0.26},${baseY - height} ${x + width * 0.08},${baseY - height * 0.68} ${x + width / 2},${baseY}`}
    />
  );
}

export function TwoHumpMountain({ x, baseY, width = 70, height = 20, fill }: { x: number; baseY: number; width?: number; height?: number; fill: string }) {
  return (
    <polygon
      fill={fill}
      points={`${x - width / 2},${baseY} ${x - width * 0.28},${baseY - height * 0.5} ${x - width * 0.12},${baseY - height} ${x + width * 0.03},${baseY - height * 0.5} ${x + width * 0.28},${baseY - height * 0.78} ${x + width / 2},${baseY}`}
    />
  );
}

export function PalmTree({ x, baseY, height = 15, fill }: { x: number; baseY: number; height?: number; fill: string }) {
  const topY = baseY - height;
  const fronds: [number, number][] = [
    [-1, -1],
    [1, -0.6],
    [0, -1.3],
    [-0.6, -0.15],
    [0.9, -0.9],
  ];
  return (
    <g fill="none" stroke={fill} strokeLinecap="round">
      <path d={`M ${x - 0.6} ${baseY} Q ${x - 2.2} ${topY + height * 0.45} ${x} ${topY}`} strokeWidth={1.1} />
      {fronds.map(([dx, dy], i) => (
        <path key={i} d={`M ${x} ${topY} Q ${x + dx * 6} ${topY + dy * 3} ${x + dx * 8.5} ${topY + 2 + dy * 2}`} strokeWidth={1.3} />
      ))}
    </g>
  );
}

// --- Named landmark silhouettes, one per city that has custom artwork ---

export function CNTower({ x, baseY, height = 70, fill }: { x: number; baseY: number; height?: number; fill: string }) {
  const topY = baseY - height;
  const podY = baseY - height * 0.62;
  return (
    <g fill={fill}>
      <polygon points={`${x - 3.2},${baseY} ${x - 1.5},${podY + 4} ${x + 1.5},${podY + 4} ${x + 3.2},${baseY}`} />
      <ellipse cx={x} cy={podY} rx={5.5} ry={3.1} />
      <polygon points={`${x - 1.1},${podY - 2} ${x - 0.5},${topY + 5} ${x + 0.5},${topY + 5} ${x + 1.1},${podY - 2}`} />
      <line x1={x} y1={topY + 5} x2={x} y2={topY} stroke={fill} strokeWidth={0.8} />
    </g>
  );
}

export function SpaceNeedle({ x, baseY, height = 58, fill }: { x: number; baseY: number; height?: number; fill: string }) {
  const topY = baseY - height;
  const discY = baseY - height * 0.72;
  return (
    <g fill={fill}>
      <polygon points={`${x - 8.5},${baseY} ${x - 1.5},${discY + 6} ${x + 1.5},${discY + 6} ${x + 8.5},${baseY}`} opacity={0.92} />
      <polygon points={`${x - 7},${discY + 3} ${x - 5.5},${discY - 3} ${x + 5.5},${discY - 3} ${x + 7},${discY + 3}`} />
      <polygon points={`${x - 0.9},${discY - 3} ${x - 0.4},${topY} ${x + 0.4},${topY} ${x + 0.9},${discY - 3}`} />
    </g>
  );
}

export function CalgaryTower({ x, baseY, height = 48, fill }: { x: number; baseY: number; height?: number; fill: string }) {
  const topY = baseY - height;
  const podY = baseY - height * 0.78;
  return (
    <g fill={fill}>
      <polygon points={`${x - 2.4},${baseY} ${x - 1},${podY + 3} ${x + 1},${podY + 3} ${x + 2.4},${baseY}`} />
      <ellipse cx={x} cy={podY} rx={3.4} ry={2} />
      <rect x={x - 0.6} y={topY} width={1.2} height={Math.max(0, podY - topY - 1)} />
    </g>
  );
}

export function Obelisk({ x, baseY, height = 52, width = 5, fill }: { x: number; baseY: number; height?: number; width?: number; fill: string }) {
  const topY = baseY - height;
  const tipY = topY - height * 0.12;
  return <polygon fill={fill} points={`${x - width / 2},${baseY} ${x - width / 2},${topY} ${x},${tipY} ${x + width / 2},${topY} ${x + width / 2},${baseY}`} />;
}

export function CapitolDome({ x, baseY, width = 20, height = 12, fill }: { x: number; baseY: number; width?: number; height?: number; fill: string }) {
  const drumH = height * 0.4;
  return (
    <g fill={fill}>
      <rect x={x - width / 2} y={baseY - drumH} width={width} height={drumH} />
      <path d={`M ${x - width * 0.32} ${baseY - drumH} A ${width * 0.32} ${height * 0.62} 0 0 1 ${x + width * 0.32} ${baseY - drumH} Z`} />
      <rect x={x - 0.7} y={baseY - height - 3} width={1.4} height={4} />
    </g>
  );
}

export function TransamericaPyramid({ x, baseY, height = 60, width = 13, fill }: { x: number; baseY: number; height?: number; width?: number; fill: string }) {
  const topY = baseY - height;
  const shoulderY = topY + 6;
  return (
    <g fill={fill}>
      <polygon points={`${x - width / 2},${baseY} ${x - width * 0.14},${shoulderY} ${x + width * 0.14},${shoulderY} ${x + width / 2},${baseY}`} />
      <polygon points={`${x - width * 0.14},${shoulderY} ${x},${topY} ${x + width * 0.14},${shoulderY}`} />
      <line x1={x - 2.4} y1={shoulderY} x2={x - 2.4} y2={shoulderY - 6} stroke={fill} strokeWidth={0.7} />
      <line x1={x + 2.4} y1={shoulderY} x2={x + 2.4} y2={shoulderY - 6} stroke={fill} strokeWidth={0.7} />
    </g>
  );
}

export function SlantRoofTower({ x, baseY, height = 56, width = 12, fill }: { x: number; baseY: number; height?: number; width?: number; fill: string }) {
  const topY = baseY - height;
  return <polygon fill={fill} points={`${x - width / 2},${baseY} ${x - width / 2},${topY + 6} ${x + width / 2},${topY} ${x + width / 2},${baseY}`} />;
}

export function SteppedSkyscraper({ x, baseY, height = 68, width = 16, fill }: { x: number; baseY: number; height?: number; width?: number; fill: string }) {
  const topY = baseY - height;
  const tier1H = height * 0.14;
  const tier2H = height * 0.12;
  return (
    <g fill={fill}>
      <rect x={x - width / 2} y={topY + tier1H + tier2H} width={width} height={height - tier1H - tier2H} />
      <rect x={x - width * 0.32} y={topY + tier1H} width={width * 0.64} height={tier2H + 2} />
      <rect x={x - width * 0.16} y={topY} width={width * 0.32} height={tier1H + 2} />
      <line x1={x} y1={topY} x2={x} y2={topY - 5} stroke={fill} strokeWidth={0.9} />
    </g>
  );
}

export function CrossHill({ x, baseY, width = 90, height = 16, fill }: { x: number; baseY: number; width?: number; height?: number; fill: string }) {
  const peakY = baseY - height;
  return (
    <g>
      <polygon fill={fill} points={`${x - width / 2},${baseY} ${x - width * 0.08},${peakY} ${x + width * 0.18},${peakY + height * 0.15} ${x + width / 2},${baseY}`} />
      <g stroke={fill} strokeWidth={0.8}>
        <line x1={x - width * 0.08} y1={peakY - 7} x2={x - width * 0.08} y2={peakY + 1} />
        <line x1={x - width * 0.12} y1={peakY - 4} x2={x - width * 0.04} y2={peakY - 4} />
      </g>
    </g>
  );
}

export function Stars({ seed, count, width, height, opacity }: { seed: string; count: number; width: number; height: number; opacity: number }) {
  if (opacity <= 0) return null;
  // Same "own local generator from a string seed" reasoning as Building
  // above - never a random() instance shared across separately-rendered
  // components.
  const random = createRandom(hashString(seed));
  const stars = Array.from({ length: count }, (_, i) => ({
    cx: random() * width,
    cy: random() * height * 0.55,
    r: 0.3 + random() * 0.5,
    key: i,
  }));
  return (
    <g fill="#ffffff" opacity={opacity}>
      {stars.map((s) => (
        <circle key={s.key} cx={s.cx} cy={s.cy} r={s.r} />
      ))}
    </g>
  );
}
