"use client";

import { useEffect, useRef, useState } from "react";

// Semicircular 0-100 performance gauge shared by both CRMs. The public
// component name is retained so every existing Admin/Agent report and
// dashboard receives the upgrade without duplicating presentation logic.
export type PerformanceTier = "green" | "yellow" | "red" | "blue";

export type PerformanceGaugeSegment = { start: number; end: number; color: string; label: string; key: PerformanceTier };

const CENTER_X = 120;
const CENTER_Y = 116;
const ARC_RADIUS = 84;

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

// Kept as an alias (rather than every caller importing the growth-named
// constant) now that both CRMs render the identical band set.
const DEFAULT_SEGMENTS: readonly PerformanceGaugeSegment[] = GROWTH_CRM_GAUGE_SEGMENTS;

const SCORE_COLOR: Record<PerformanceTier, string> = {
  blue: "#3f8fc4",
  green: "#58a966",
  yellow: "#d7a43c",
  red: "#ce676b",
};

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

function pointForScore(score: number, radius: number) {
  const angle = Math.PI - (Math.PI * score) / 100;
  return {
    x: CENTER_X + radius * Math.cos(angle),
    y: CENTER_Y - radius * Math.sin(angle),
  };
}

function arcPath(startScore: number, endScore: number) {
  const start = pointForScore(startScore, ARC_RADIUS);
  const end = pointForScore(endScore, ARC_RADIUS);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export default function PerformanceRing({
  percentage,
  tier,
  size = 136,
  strokeWidth = 12,
  label = "Performance Score",
  segments = DEFAULT_SEGMENTS,
}: {
  percentage: number;
  tier: PerformanceTier;
  size?: number;
  strokeWidth?: number;
  label?: string;
  segments?: readonly PerformanceGaugeSegment[];
}) {
  const score = Math.max(0, Math.min(100, Math.round(percentage)));
  const [animatedScore, setAnimatedScore] = useState(0);
  const animatedScoreRef = useRef(0);
  const activeSegment = performanceBand(score, segments);
  const color = activeSegment?.color ?? SCORE_COLOR[tier];

  useEffect(() => {
    const from = animatedScoreRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || from === score) {
      animatedScoreRef.current = score;
      setAnimatedScore(score);
      return;
    }

    let animationFrame = 0;
    const startedAt = performance.now();
    const duration = 950;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (score - from) * eased;
      animatedScoreRef.current = next;
      setAnimatedScore(next);
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [score]);

  const displayedScore = Math.round(animatedScore);

  return (
    <figure className="m-0 flex shrink-0 flex-col items-center" style={{ width: size }}>
      <svg
        viewBox="0 0 240 148"
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={`Performance score ${score} out of 100${label ? `, ${label}` : ""}`}
      >
        <path
          d={arcPath(0, 100)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth * 2.15}
          strokeLinecap="round"
          opacity="0.65"
        />

        {segments.map((segment) => (
          <path
            key={segment.label}
            d={arcPath(segment.start, segment.end)}
            fill="none"
            stroke={segment.color}
            strokeWidth={strokeWidth * 1.85}
            strokeLinecap="butt"
          />
        ))}

        {[0, 20, 40, 60, 80, 100].map((tick) => {
          const position = pointForScore(tick, 108);
          return (
            <text key={tick} x={position.x} y={position.y + 4} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">
              {tick}
            </text>
          );
        })}

        {[0, 20, 40, 60, 80, 100].map((tick) => {
          const start = pointForScore(tick, 94);
          const end = pointForScore(tick, 101);
          return (
            <line
              key={`${tick}-mark`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="#475569"
              strokeWidth="1.5"
              opacity="0.7"
            />
          );
        })}

        {segments.map((segment) => {
          const midpoint = (segment.start + segment.end) / 2;
          const position = pointForScore(midpoint, 84);
          const rotation = 180 - midpoint * 1.8;
          return (
            <text
              key={`${segment.label}-label`}
              x={position.x}
              y={position.y + 3}
              textAnchor="middle"
              transform={`rotate(${rotation} ${position.x} ${position.y})`}
              className="fill-white text-[7.5px] font-bold tracking-tight"
            >
              {segment.label}
            </text>
          );
        })}

        <g
          aria-hidden="true"
          style={{
            transform: `rotate(${animatedScore * 1.8}deg)`,
            transformBox: "view-box",
            transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
          }}
        >
          <path d={`M ${CENTER_X - 70} ${CENTER_Y} L ${CENTER_X - 7} ${CENTER_Y - 6} L ${CENTER_X} ${CENTER_Y} L ${CENTER_X - 7} ${CENTER_Y + 6} Z`} fill={color} />
        </g>
        <circle cx={CENTER_X} cy={CENTER_Y} r="29" fill={color} opacity="0.2" />
        <circle cx={CENTER_X} cy={CENTER_Y} r="24" fill={color} />
        <text x={CENTER_X} y={CENTER_Y + 8} textAnchor="middle" className="fill-white text-[25px] font-bold">
          {displayedScore}
        </text>
      </svg>
      <figcaption className="-mt-1 text-center">
        {label ? <span className="block text-[12px] font-bold text-slate-700">{label}</span> : null}
        <span className="mt-0.5 block text-[11px] font-semibold" style={{ color }}>
          {activeSegment?.label}
        </span>
      </figcaption>
    </figure>
  );
}
