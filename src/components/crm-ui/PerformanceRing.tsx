"use client";

import { CheckCircle2 } from "lucide-react";

// Circular "percentage of target" indicator shared by both CRMs' Agent
// Performance Report cards. Purely presentational - it renders whatever
// percentage/tier the existing performance calculations
// (computeCrmAgentPerformance / computeLeadgenAgentPerformance) already
// produce; it does not compute or alter any target/threshold itself.
export type PerformanceTier = "green" | "yellow" | "red";

const TIER_COLOR: Record<PerformanceTier, string> = {
  green: "#34D399",
  yellow: "#FBBF24",
  red: "#FB7185",
};

export default function PerformanceRing({
  percentage,
  tier,
  size = 136,
  strokeWidth = 12,
  label,
}: {
  percentage: number;
  tier: PerformanceTier;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference * (1 - clamped / 100);
  const color = TIER_COLOR[tier];
  const achieved = percentage >= 100;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${percentage}% of target`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--crm-border, #dce4ec)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-extrabold leading-none text-[var(--crm-text,#17283b)]">{percentage}%</span>
          {label && (
            <span className="mt-1 max-w-[80px] text-center text-[9.5px] font-semibold uppercase leading-tight tracking-wide text-[var(--crm-text-muted,#6b7c90)]">
              {label}
            </span>
          )}
        </div>
      </div>
      {achieved && (
        <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
          Target Achieved
        </span>
      )}
    </div>
  );
}
