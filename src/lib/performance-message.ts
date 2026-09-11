import type { PerformanceTier } from "@/lib/performance-gauge";

// Short, generic copy for the Agent Performance Score card's message box,
// keyed only by which of the four universal gauge bands (see
// GROWTH_CRM_GAUGE_SEGMENTS) the score falls in - never by a specific
// score, name, or CRM, so it stays accurate for any agent's real number
// and never drifts from the gauge/status pill it sits next to.
export type PerformanceStatusMessage = { headline: string; description: string };

const PERFORMANCE_STATUS_MESSAGE: Record<PerformanceTier, PerformanceStatusMessage> = {
  red: {
    headline: "Needs attention",
    description: "This week is behind pace. Focus on the targets below to get back on track.",
  },
  yellow: {
    headline: "Almost there",
    description: "Making progress — a bit more this week will move you into the Good range.",
  },
  green: {
    headline: "On track!",
    description: "Keep up the great work. You're in the Good range.",
  },
  blue: {
    headline: "Outstanding!",
    description: "Excellent work — you're comfortably ahead of this week's targets.",
  },
};

export function performanceStatusMessage(tier: PerformanceTier): PerformanceStatusMessage {
  return PERFORMANCE_STATUS_MESSAGE[tier];
}
