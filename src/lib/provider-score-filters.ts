import type { ProviderScoreBreakdown, ProviderScoreRatingLabel } from "./provider-types";

// Shared by the operational Providers list pages (brief "PROVIDER LIST
// SCORE DISPLAY": "Allow filtering by: Score range, Rating label,
// Providers needing attention, New providers with limited data, Missing
// documents, Low responsiveness, Strong performers"). The Provider
// Scorecard lives only on the operational profile (cleaning_providers) -
// this works against any row shape carrying the same score_* columns.
export const SCORE_FILTER_OPTIONS = [
  { value: "all", label: "Any score" },
  { value: "excellent", label: "Excellent (90-100)" },
  { value: "strong", label: "Strong (75-89)" },
  { value: "developing", label: "Developing (60-74)" },
  { value: "needs_attention", label: "Needs Attention (40-59)" },
  { value: "high_risk", label: "High Risk (0-39)" },
  { value: "new_provider", label: "New — limited data" },
  { value: "missing_documents", label: "Missing documents" },
  { value: "low_responsiveness", label: "Low responsiveness" },
] as const;

export type ScoreFilter = (typeof SCORE_FILTER_OPTIONS)[number]["value"];

const RATING_TO_FILTER: Record<ProviderScoreRatingLabel, ScoreFilter> = {
  Excellent: "excellent",
  Strong: "strong",
  Developing: "developing",
  "Needs Attention": "needs_attention",
  "High Risk": "high_risk",
};

export type ScorableProvider = {
  score: number | null;
  score_label: string | null;
  score_breakdown: ProviderScoreBreakdown | null;
  score_is_new_provider: boolean;
};

export function matchesScoreFilter(provider: ScorableProvider, filter: ScoreFilter): boolean {
  if (filter === "all") return true;
  if (filter === "new_provider") return provider.score_is_new_provider;

  if (filter === "missing_documents") {
    const docCategory = provider.score_breakdown?.categories.find((c) => c.category === "Documentation");
    return Boolean(docCategory && docCategory.pointsEarned < docCategory.pointsAvailable);
  }

  if (filter === "low_responsiveness") {
    const responsivenessCategory = provider.score_breakdown?.categories.find((c) => c.category === "Responsiveness");
    return Boolean(
      responsivenessCategory &&
        responsivenessCategory.applicable &&
        responsivenessCategory.pointsEarned < responsivenessCategory.pointsAvailable * 0.6
    );
  }

  if (!provider.score_label) return false;
  return RATING_TO_FILTER[provider.score_label as ProviderScoreRatingLabel] === filter;
}

export function sortByScore<T extends ScorableProvider>(providers: T[], direction: "score_desc" | "score_asc"): T[] {
  const sorted = [...providers].sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    return direction === "score_desc" ? scoreB - scoreA : scoreA - scoreB;
  });
  return sorted;
}
