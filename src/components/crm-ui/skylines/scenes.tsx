import type { ReactNode } from "react";
import type { SkyPalette } from "./palette";
import { VIEW_WIDTH, GROUND_Y } from "./viewport";
import { hashString, createRandom } from "./random";
import {
  Building,
  generateBuildingRow,
  MountainRange,
  VolcanicCrater,
  PalmTree,
  CNTower,
  SpaceNeedle,
  CalgaryTower,
  Obelisk,
  CapitolDome,
  TransamericaPyramid,
  SlantRoofTower,
  SteppedSkyscraper,
  CrossHill,
  type BuildingVariant,
} from "./pieces";

// `seed` (a plain string), not a shared random-number-generator instance,
// is threaded through every scene/piece below - see the comment on
// Building in pieces.tsx for why: each piece derives its own local,
// disposable generator from the seed it's given, so nothing here can be
// corrupted by React rendering a component more than once (Strict Mode)
// or in a different relative order than expected.
export type SceneProps = { palette: SkyPalette; seed: string };

// Two building rows with a gap left clear for a named landmark to stand
// in without a generic tower overlapping it - the far (hazy, no lit
// windows) row reads as background depth, the near row is the real
// foreground skyline.
function BuildingRows({
  palette,
  seed,
  gapStart,
  gapEnd,
  nearMin = 26,
  nearMax = 56,
  farMin = 16,
  farMax = 34,
  variants,
}: {
  palette: SkyPalette;
  seed: string;
  gapStart?: number;
  gapEnd?: number;
  nearMin?: number;
  nearMax?: number;
  farMin?: number;
  farMax?: number;
  variants?: BuildingVariant[];
}) {
  const layoutRandom = createRandom(hashString(`${seed}-layout`));
  const far = generateBuildingRow(layoutRandom, { startX: -10, endX: VIEW_WIDTH + 10, minHeight: farMin, maxHeight: farMax, variants });
  const nearSegments =
    gapStart === undefined || gapEnd === undefined
      ? [[-10, VIEW_WIDTH + 10] as const]
      : ([
          [-10, gapStart],
          [gapEnd, VIEW_WIDTH + 10],
        ] as const);
  const near = nearSegments.flatMap(([s, e]) => generateBuildingRow(layoutRandom, { startX: s, endX: e, minHeight: nearMin, maxHeight: nearMax, variants }));
  const litRatio = palette.night ? 0.45 : 0;

  return (
    <>
      {far.map((b, i) => (
        <Building key={`f${i}`} spec={b} groundY={GROUND_Y} palette={palette} litRatio={0} windowSeed={`${seed}-f${i}`} opacity={0.55} />
      ))}
      {near.map((b, i) => (
        <Building key={`n${i}`} spec={b} groundY={GROUND_Y} palette={palette} litRatio={litRatio} windowSeed={`${seed}-n${i}`} />
      ))}
    </>
  );
}

function Toronto({ palette, seed }: SceneProps) {
  return (
    <>
      <BuildingRows palette={palette} seed={seed} gapStart={138} gapEnd={162} />
      <CNTower x={150} baseY={GROUND_Y} height={74} fill={palette.landmarkFill} />
    </>
  );
}

function Vancouver({ palette, seed }: SceneProps) {
  return (
    <>
      <MountainRange
        peaks={[
          [10, 44],
          [70, 30],
          [130, 40],
          [190, 26],
          [250, 38],
          [292, 32],
        ]}
        groundY={GROUND_Y - 8}
        fill={palette.mountainFar}
        opacity={0.8}
      />
      <BuildingRows palette={palette} seed={seed} nearMin={30} nearMax={58} variants={["block", "tapered", "spired"]} />
    </>
  );
}

function NewYorkCity({ palette, seed }: SceneProps) {
  return (
    <>
      <BuildingRows palette={palette} seed={seed} gapStart={140} gapEnd={160} nearMin={30} nearMax={54} variants={["block", "tapered", "spired", "stepped"]} />
      <SteppedSkyscraper x={150} baseY={GROUND_Y} height={70} width={16} fill={palette.landmarkFill} />
    </>
  );
}

function Chicago({ palette, seed }: SceneProps) {
  return (
    <>
      <BuildingRows palette={palette} seed={seed} gapStart={132} gapEnd={168} />
      <SteppedSkyscraper x={150} baseY={GROUND_Y} height={72} width={17} fill={palette.landmarkFill} />
    </>
  );
}

function SanFrancisco({ palette, seed }: SceneProps) {
  return (
    <>
      <MountainRange
        peaks={[
          [0, 54],
          [60, 46],
          [120, 56],
          [200, 44],
          [260, 52],
          [300, 46],
        ]}
        groundY={GROUND_Y - 2}
        fill={palette.mountainFar}
        opacity={0.6}
      />
      <BuildingRows palette={palette} seed={seed} gapStart={140} gapEnd={160} />
      <TransamericaPyramid x={150} baseY={GROUND_Y} height={64} fill={palette.landmarkFill} />
    </>
  );
}

function Seattle({ palette, seed }: SceneProps) {
  return (
    <>
      <MountainRange peaks={[[150, 34]]} groundY={GROUND_Y - 6} fill={palette.mountainFar} opacity={0.7} snowCapAt={0} />
      <BuildingRows palette={palette} seed={seed} gapStart={130} gapEnd={168} />
      <SpaceNeedle x={149} baseY={GROUND_Y} height={60} fill={palette.landmarkFill} />
    </>
  );
}

function Washington({ palette, seed }: SceneProps) {
  return (
    <>
      {/* D.C. actually has a legal building-height limit, so the skyline
          stays deliberately low around the two landmarks. */}
      <BuildingRows palette={palette} seed={seed} gapStart={90} gapEnd={230} nearMin={12} nearMax={22} farMin={10} farMax={16} variants={["block"]} />
      <CapitolDome x={100} baseY={GROUND_Y} width={26} height={15} fill={palette.landmarkFill} />
      <Obelisk x={200} baseY={GROUND_Y} height={54} fill={palette.landmarkFill} />
    </>
  );
}

function Boston({ palette, seed }: SceneProps) {
  return (
    <>
      <BuildingRows palette={palette} seed={seed} gapStart={138} gapEnd={162} nearMin={18} nearMax={38} variants={["block", "tapered"]} />
      <SlantRoofTower x={150} baseY={GROUND_Y} height={58} fill={palette.landmarkFill} />
    </>
  );
}

function LosAngeles({ palette, seed }: SceneProps) {
  return (
    <>
      <BuildingRows palette={palette} seed={seed} nearMin={16} nearMax={44} variants={["block", "tapered"]} />
      <PalmTree x={26} baseY={GROUND_Y} height={20} fill={palette.buildingLine} />
      <PalmTree x={266} baseY={GROUND_Y} height={17} fill={palette.buildingLine} />
    </>
  );
}

function Miami({ palette, seed }: SceneProps) {
  return (
    <>
      <BuildingRows palette={palette} seed={seed} nearMin={20} nearMax={46} variants={["block", "tapered"]} />
      <PalmTree x={40} baseY={GROUND_Y} height={18} fill={palette.buildingLine} />
      <PalmTree x={150} baseY={GROUND_Y} height={15} fill={palette.buildingLine} />
      <PalmTree x={252} baseY={GROUND_Y} height={19} fill={palette.buildingLine} />
    </>
  );
}

function Montreal({ palette, seed }: SceneProps) {
  return (
    <>
      <CrossHill x={70} baseY={GROUND_Y - 4} width={100} height={18} fill={palette.mountainFar} />
      <BuildingRows palette={palette} seed={seed} />
    </>
  );
}

function Calgary({ palette, seed }: SceneProps) {
  return (
    <>
      <MountainRange
        peaks={[
          [190, 50],
          [230, 40],
          [270, 48],
          [300, 42],
        ]}
        groundY={GROUND_Y - 4}
        fill={palette.mountainFar}
        opacity={0.55}
      />
      <BuildingRows palette={palette} seed={seed} gapStart={138} gapEnd={158} />
      <CalgaryTower x={148} baseY={GROUND_Y} height={50} fill={palette.landmarkFill} />
    </>
  );
}

function Denver({ palette, seed }: SceneProps) {
  return (
    <>
      <MountainRange
        peaks={[
          [0, 30],
          [50, 14],
          [100, 34],
          [150, 12],
          [200, 32],
          [250, 18],
          [300, 28],
        ]}
        groundY={GROUND_Y - 2}
        fill={palette.mountainFar}
        opacity={0.75}
        snowCapAt={3}
      />
      <BuildingRows palette={palette} seed={seed} nearMin={20} nearMax={40} />
    </>
  );
}

function Honolulu({ palette, seed }: SceneProps) {
  return (
    <>
      <VolcanicCrater x={230} baseY={GROUND_Y - 2} width={90} height={26} fill={palette.mountainFar} />
      <BuildingRows palette={palette} seed={seed} nearMin={18} nearMax={36} variants={["block", "tapered"]} />
      <PalmTree x={30} baseY={GROUND_Y} height={17} fill={palette.buildingLine} />
      <PalmTree x={272} baseY={GROUND_Y} height={15} fill={palette.buildingLine} />
    </>
  );
}

function Phoenix({ palette, seed }: SceneProps) {
  return (
    <>
      <MountainRange
        peaks={[
          [220, 34],
          [250, 20],
          [270, 30],
          [300, 24],
        ]}
        groundY={GROUND_Y - 2}
        fill={palette.mountainFar}
        opacity={0.6}
      />
      <BuildingRows palette={palette} seed={seed} nearMin={16} nearMax={32} variants={["block", "tapered"]} />
    </>
  );
}

// Keyed by the exact `${country}-${regionCode}-${city}` seed built in
// ClientLocalTimePanel.tsx - an exact match gets hand-authored artwork,
// everything else falls back to GenericSkyline below.
export const CUSTOM_SCENES: Record<string, (props: SceneProps) => ReactNode> = {
  "CA-ON-Toronto": Toronto,
  "CA-BC-Vancouver": Vancouver,
  "US-NY-New York City": NewYorkCity,
  "US-IL-Chicago": Chicago,
  "US-CA-San Francisco": SanFrancisco,
  "US-WA-Seattle": Seattle,
  "US-DC-Washington": Washington,
  "US-MA-Boston": Boston,
  "US-CA-Los Angeles": LosAngeles,
  "US-FL-Miami": Miami,
  "CA-QC-Montreal": Montreal,
  "CA-AB-Calgary": Calgary,
  "US-CO-Denver": Denver,
  "US-HI-Honolulu": Honolulu,
  "US-AZ-Phoenix": Phoenix,
};

// Every other city (and any future one added to timezone-locations.ts
// without matching custom artwork) gets this: still a real, detailed,
// depth-layered skyline - just not tied to a specific real building -
// which is the "attractive realistic generic North American skyline"
// the spec calls for as the fallback.
export function GenericSkyline({ palette, seed }: SceneProps) {
  return <BuildingRows palette={palette} seed={seed} />;
}
