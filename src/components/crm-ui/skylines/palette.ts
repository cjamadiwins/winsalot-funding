// Day/night colour tokens for every skyline. Geometry never changes
// between day and night - only these colours do - so "darker skyline with
// illuminated windows at night" is a single recolor, not a second set of
// artwork to maintain.
export type SkyPalette = {
  night: boolean;
  skyTop: string;
  skyBottom: string;
  skyGlow: string; // subtle horizon warmth (day sun haze / night light pollution)
  buildingFar: string; // back layer - lighter/hazier (atmospheric depth)
  buildingNear: string; // front layer - richer/darker
  buildingLine: string; // roofline/edge accent
  landmarkFill: string; // the hero landmark (CN Tower, Space Needle, ...)
  windowLit: string;
  windowUnlit: string;
  windowLitOpacity: number;
  windowUnlitOpacity: number;
  mountainFar: string;
  mountainNear: string;
  starOpacity: number;
};

export const DAY_PALETTE: SkyPalette = {
  night: false,
  skyTop: "#a9d3f5",
  skyBottom: "#eef6fc",
  skyGlow: "#fef6df",
  buildingFar: "#8ba0c2",
  buildingNear: "#3d5a80",
  buildingLine: "#2f4764",
  landmarkFill: "#33547a",
  windowLit: "#ffffff",
  windowUnlit: "#5c7ca8",
  windowLitOpacity: 0.5,
  windowUnlitOpacity: 0.3,
  mountainFar: "#c3d3e6",
  mountainNear: "#a3b8d1",
  starOpacity: 0,
};

export const NIGHT_PALETTE: SkyPalette = {
  night: true,
  skyTop: "#0a1428",
  skyBottom: "#28315a",
  skyGlow: "#3a2f56",
  buildingFar: "#232d4d",
  buildingNear: "#0d1526",
  buildingLine: "#060a14",
  landmarkFill: "#111b30",
  windowLit: "#ffd873",
  windowUnlit: "#182238",
  windowLitOpacity: 0.95,
  windowUnlitOpacity: 0.55,
  mountainFar: "#26314f",
  mountainNear: "#161f38",
  starOpacity: 0.8,
};

// Local hour cutoffs for "looks like daylight" vs "looks like night" in the
// illustration - not a real sunrise/sunset calculation (that would need
// each city's latitude/longitude and date), just a reasonable fixed
// generic-daylight window, which is all a decorative illustration needs.
export function isNightHour(hour: number): boolean {
  return hour < 6 || hour >= 19;
}
