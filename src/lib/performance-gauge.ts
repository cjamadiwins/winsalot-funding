// Pure, server-safe gauge-band logic shared by PerformanceRing (a "use
// client" component) and every Server Component that renders an Agent
// Performance Score card. This file MUST NOT have a "use client"
// directive: Next.js treats every value exported from a client module as
// a client-only reference, so a Server Component calling a function like
// performanceBand() (or even just reading a plain exported constant)
// straight from a "use client" file crashes at runtime with "Attempted
// to call X() from the server but X is on the client." Keeping this pure
// data/logic here, with PerformanceRing importing it rather than
// defining it, is what lets Server Components use it safely.
export type PerformanceTier = "green" | "yellow" | "red" | "blue";

export type PerformanceGaugeSegment = { start: number; end: number; color: string; label: string; key: PerformanceTier };

// Universal four-band gauge treatment shared by both CRMs and every
// Agent Performance Score surface: 0-39 Needs Improvement (red), 40-59
// Fair (amber), 60-79 Good (green), 80-100 Excellent (blue). `key` lines
// up with PerformanceTier/CrmPerformanceTier so callers can look up a
// matching badge/progress-bar style (see PERFORMANCE_BAND_STYLES) for
// whatever band the needle lands in - the gauge, status pill, and
// progress bars can then never disagree for the same score.
export const GROWTH_CRM_GAUGE_SEGMENTS: readonly PerformanceGaugeSegment[] = [
  { start: 0, end: 40, color: "#df7f82", label: "Needs Improvement", key: "red" },
  { start: 40, end: 60, color: "#efc76f", label: "Fair", key: "yellow" },
  { start: 60, end: 80, color: "#78bd72", label: "Good", key: "green" },
  { start: 80, end: 100, color: "#63b9c7", label: "Excellent", key: "blue" },
];

// One Tailwind color set per band, shared by every percentage badge,
// progress bar, and status pill across both CRMs' redesigned performance
// cards - keyed the same way as the gauge's own segments so a card's
// status pill/progress bar can never show a different color than the
// gauge it sits next to.
export const PERFORMANCE_BAND_STYLES: Record<PerformanceTier, { bar: string; badge: string; text: string }> = {
  blue: { bar: "bg-sky-500", badge: "bg-sky-100 text-sky-800", text: "text-sky-700" },
  green: { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  yellow: { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  red: { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-800", text: "text-rose-700" },
};

// The band a given 0-100 score falls in for a segment set - exported so
// callers can derive a status pill/message/progress-bar color that is
// guaranteed to match whatever band PerformanceRing itself paints for
// the same score, instead of computing it a second, possibly-drifting way.
export function performanceBand(
  score: number,
  segments: readonly PerformanceGaugeSegment[] = GROWTH_CRM_GAUGE_SEGMENTS
): PerformanceGaugeSegment {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const match = segments.find((segment, index) => clamped >= segment.start && (clamped < segment.end || index === segments.length - 1));
  return match ?? segments[segments.length - 1];
}
