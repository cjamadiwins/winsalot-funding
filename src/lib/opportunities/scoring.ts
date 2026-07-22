import { lookupCity } from "./cities";
import { hasExplicitRequestTerm, STRONG_CLEANING_PHRASES } from "./cleaning-relevance";
import type { IntentLevel, OpportunityCandidate } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

// Revised thresholds per the stricter-filter brief: Hot 70-100, Warm
// 45-69, Research 0-44. A record only ever reaches this function after
// evaluateCleaningRelevance() has already accepted it - there is no
// "Rejected" intent level stored in the database, since a rejected
// candidate is never inserted at all (see run.ts).
export function intentLevelForScore(score: number): IntentLevel {
  if (score >= 70) return "Hot";
  if (score >= 45) return "Warm";
  return "Research";
}

export function isExpired(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() < now.getTime();
}

// Implements the revised scoring table: cleaning-phrase strength is now
// the dominant signal (title beats description/category), with an
// explicit RFP/proposal/bid/tender request term as a separate bonus
// rather than the sole basis for a "tender" score - a generic tender with
// no strong cleaning phrase never reaches this function to begin with, so
// there's no penalty term needed to counteract a false-positive base
// score the way the old opportunity_type-based scoring needed one.
export function scoreOpportunity(
  candidate: OpportunityCandidate,
  now: Date = new Date()
): { score: number; level: IntentLevel } {
  let score = 0;

  const titleLower = candidate.opportunity_title.toLowerCase();
  const descriptionLower = (candidate.description ?? "").toLowerCase();
  const categoryLower = (candidate.service_needed ?? "").toLowerCase();

  const strongInTitle = STRONG_CLEANING_PHRASES.some((phrase) => titleLower.includes(phrase));
  if (strongInTitle) {
    score += 50;
  } else if (
    STRONG_CLEANING_PHRASES.some((phrase) => descriptionLower.includes(phrase) || categoryLower.includes(phrase))
  ) {
    score += 35;
  }

  if (hasExplicitRequestTerm(`${titleLower} ${descriptionLower}`)) {
    score += 20;
  }

  if (candidate.deadline) {
    const daysToDeadline = daysBetween(new Date(candidate.deadline), now);
    if (daysToDeadline >= 0 && daysToDeadline <= 30) {
      score += 15;
    }
  }

  if (lookupCity(candidate.city)) {
    score += 15;
  }

  if (candidate.public_email || candidate.public_phone) {
    score += 10;
  }

  if (candidate.date_posted) {
    const daysSincePosted = daysBetween(now, new Date(candidate.date_posted));
    if (daysSincePosted >= 0 && daysSincePosted <= 14) {
      score += 10;
    }
  }

  score = Math.min(100, score);

  return { score, level: intentLevelForScore(score) };
}
