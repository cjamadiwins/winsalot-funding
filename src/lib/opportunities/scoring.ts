import { lookupCity } from "./cities";
import type { IntentLevel, OpportunityCandidate } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

export function intentLevelForScore(score: number): IntentLevel {
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Research";
}

export function isExpired(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() < now.getTime();
}

// Implements the scoring table from the project brief. Every rule is
// independent and additive/subtractive, then the total is clamped to
// [0, 100] - a candidate that already has a good base score plus every
// bonus (e.g. a BC tender, posted this week, with a public phone number)
// can legitimately hit the Hot ceiling without any single rule needing to
// carry the whole score.
export function scoreOpportunity(
  candidate: OpportunityCandidate,
  now: Date = new Date()
): { score: number; level: IntentLevel } {
  let score = 0;

  switch (candidate.opportunity_type) {
    case "rfp_tender":
      score += 50;
      break;
    case "quote_request":
      score += 40;
      break;
    case "new_location":
      score += 15;
      break;
    case "hiring_signal":
      score += 5;
      break;
    default:
      break;
  }

  if (candidate.deadline) {
    const daysToDeadline = daysBetween(new Date(candidate.deadline), now);
    if (daysToDeadline >= 0 && daysToDeadline <= 30) {
      score += 20;
    }
  }

  const city = lookupCity(candidate.city) ?? (candidate.province ? { province: candidate.province } : null);
  if (city?.province === "BC") {
    score += 15;
  }

  if (candidate.public_email || candidate.public_phone) {
    score += 10;
  }

  if (candidate.date_posted) {
    const daysSincePosted = daysBetween(now, new Date(candidate.date_posted));
    if (daysSincePosted >= 0 && daysSincePosted <= 14) {
      score += 15;
    }
    if (daysSincePosted > 60) {
      score -= 25;
    }
  }

  score = Math.max(0, Math.min(100, score));

  return { score, level: intentLevelForScore(score) };
}
