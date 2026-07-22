import { lookupCity } from "./cities";
import { hasExplicitRequestTerm, STRONG_CLEANING_PHRASES } from "./cleaning-relevance";
import { hasBuyingSignal } from "./prospect-signals";
import type { IntentLevel, OpportunityCandidate } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

// Shared thresholds: Hot 70-100, Warm 45-69, Prospect 0-44. A record only
// ever reaches scoreOpportunity() after evaluateCleaningRelevance() has
// already accepted it (Active Opportunities) or the qualified-prospects
// connector's own accept checks have passed (Qualified Prospects) -
// there is no "Rejected" intent level stored in the database, since a
// rejected candidate is never inserted at all (see run.ts).
export function intentLevelForScore(score: number): IntentLevel {
  if (score >= 70) return "Hot";
  if (score >= 45) return "Warm";
  return "Prospect";
}

export function isExpired(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() < now.getTime();
}

// Active Opportunity scoring: cleaning-phrase strength is the dominant
// signal (title beats description/category), with an explicit
// RFP/proposal/bid/tender request term as a separate bonus rather than
// the sole basis for a "tender" score - a generic tender with no strong
// cleaning phrase never reaches this function to begin with, so there's
// no penalty term needed to counteract a false-positive base score.
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

// Qualified Prospect scoring: deliberately simple and capped below Hot -
// a prospect has no confirmed cleaning request by definition, so it can
// never reach the 70+ Hot band no matter how many bonuses stack (a
// business that DOES show a confirmed request belongs in Active
// Opportunities, not here). The non-signal bonuses (city/contact/website)
// are capped so they can never add up past the 45 Warm threshold on their
// own (max 20+5+10+5=40) - without a detected buying signal, a prospect
// always stays at 'Prospect' regardless of how complete its contact info
// is. The buying-signal bonus (+25) is large enough to guarantee at least
// 'Warm' on its own (min 20+25=45) whenever one is detected, matching the
// brief's "Warm requires a strong public buying signal" definition rather
// than letting contact-info completeness alone drift a prospect into Warm.
const PROSPECT_MAX_SCORE = 69;

export function scoreQualifiedProspect(
  candidate: OpportunityCandidate
): { score: number; level: IntentLevel } {
  let score = 20;

  if (lookupCity(candidate.city)) {
    score += 5;
  }
  if (candidate.public_email && candidate.public_phone) {
    score += 10;
  } else if (candidate.public_email || candidate.public_phone) {
    score += 5;
  }
  if (candidate.website) {
    score += 5;
  }
  if (hasBuyingSignal(candidate.description)) {
    score += 25;
  }

  score = Math.min(PROSPECT_MAX_SCORE, score);

  return { score, level: intentLevelForScore(score) };
}
