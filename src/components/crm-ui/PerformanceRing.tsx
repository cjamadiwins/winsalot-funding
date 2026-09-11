"use client";

import { useEffect, useRef, useState } from "react";
import {
  GROWTH_CRM_GAUGE_SEGMENTS,
  performanceBand,
  type PerformanceGaugeSegment,
  type PerformanceTier,
} from "@/lib/performance-gauge";

// Semicircular 0-100 performance gauge shared by both CRMs. The public
// component name is retained so every existing Admin/Agent report and
// dashboard receives the upgrade without duplicating presentation logic.
//
// This file is a Client Component ("use client", for the needle/number
// animation below). The band/segment/style logic it renders with lives
// in src/lib/performance-gauge.ts instead of here, because every value
// this file exported used to be treated as a client-only reference by
// Next's Server/Client boundary - a Server Component calling
// performanceBand() (or even just reading GROWTH_CRM_GAUGE_SEGMENTS)
// directly from this module crashed in production with "Attempted to
// call performanceBand() from the server but performanceBand is on the
// client." Re-export only the types here (erased at compile time, so
// they cross the boundary safely); import values from the lib module.
export type { PerformanceTier, PerformanceGaugeSegment };

// Kept as an alias so this file's own default `segments` parameter below
// doesn't need every caller to pass GROWTH_CRM_GAUGE_SEGMENTS explicitly.
const DEFAULT_SEGMENTS: readonly PerformanceGaugeSegment[] = GROWTH_CRM_GAUGE_SEGMENTS;

const CENTER_X = 120;
const CENTER_Y = 116;
const ARC_RADIUS = 84;

const SCORE_COLOR: Record<PerformanceTier, string> = {
  blue: "#3f8fc4",
  green: "#58a966",
  yellow: "#d7a43c",
  red: "#ce676b",
};

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
    // Long enough to be clearly visible after login, while still feeling
    // quick when the selected week or live score changes.
    const duration = 1250;
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
    <figure
      className="group m-0 flex shrink-0 flex-col items-center"
      style={{ width: size }}
    >
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
          // Tangent-to-the-arc rotation (not the point's position angle -
          // that formula used to read 180 - midpoint*1.8, which is off by
          // a quarter turn and rendered "Needs Improvement" upside down).
          // Ranges -90deg at score 0 to +90deg at score 100, passing
          // through 0deg (horizontal) at the very top of the arc (score
          // 50), so every band label stays readable and right-side up.
          const rotation = midpoint * 1.8 - 90;
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
          {/* A separate inner transform keeps the score animation exact while
              giving the needle a small, responsive nudge when the user points
              at or presses anywhere around the gauge. */}
          <g
            className="transition-transform duration-300 ease-out group-hover:rotate-[2deg] group-active:rotate-[-1deg] motion-reduce:transform-none motion-reduce:transition-none"
            style={{
              transformBox: "view-box",
              transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
            }}
          >
            <path d={`M ${CENTER_X - 70} ${CENTER_Y} L ${CENTER_X - 7} ${CENTER_Y - 6} L ${CENTER_X} ${CENTER_Y} L ${CENTER_X - 7} ${CENTER_Y + 6} Z`} fill={color} />
          </g>
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
