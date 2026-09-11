// Growth CRM dashboard drill-down cards: one enrichment step shared by
// every "stat card -> exact matching records" modal (Total/New/Interested/
// Financing/Lead Generation/Follow-Ups Due/Client Won on both the admin
// and agent dashboards). Each card's displayed count and its modal's rows
// are always derived from filtering/sorting THIS SAME enriched array, so a
// card's number can never drift from what clicking it shows - the same
// root-cause class of bug the Consultations Booked card had (see
// winsalot-consultation-data.ts's header comment for that one).
import type { CrmFollowUpRow, CrmOpportunityRow } from "./crm-types";
import type { CrmOpportunityScoreRow } from "./opportunity-finder";

export type OpportunityCardRecord = CrmOpportunityRow & {
  agentName: string | null;
  // From crm_opportunity_scores.signals when a score row exists yet
  // (same signals the Smart Opportunities modal already reads) - falls
  // back to null rather than the free-form `notes` field, which is a
  // distinct concept (see latestNote below).
  lastCallOutcome: string | null;
  // signals.last_note_summary when available, otherwise the opportunity's
  // own `notes` field - same fallback SmartOpportunityRow already uses.
  latestNote: string | null;
  // The earliest pending crm_followups row for this opportunity, if any -
  // the same row Complete Follow-Up/Reschedule act on everywhere else in
  // the CRM (Overdue panels, Smart Opportunities modal).
  followUpId: string | null;
};

export function buildOpportunityCardRecords(
  opportunities: CrmOpportunityRow[],
  options: {
    scores?: Pick<CrmOpportunityScoreRow, "opportunity_id" | "signals">[];
    followUps?: Pick<CrmFollowUpRow, "id" | "opportunity_id" | "status" | "scheduled_at">[];
    agentNameById?: Map<string, string>;
  } = {}
): OpportunityCardRecord[] {
  const { scores = [], followUps = [], agentNameById = new Map<string, string>() } = options;

  const signalsByOpportunityId = new Map<string, { last_call_outcome?: string | null; last_note_summary?: string | null }>();
  for (const score of scores) {
    signalsByOpportunityId.set(
      score.opportunity_id,
      score.signals as { last_call_outcome?: string | null; last_note_summary?: string | null }
    );
  }

  // Earliest pending follow-up per opportunity - mirrors the identical
  // reduction already done separately on both dashboards and the
  // Overdue panels, just centralized here so this array's followUpId is
  // consistent with all of them.
  const pendingSortedAscending = followUps
    .filter((followUp) => followUp.status === "pending" && followUp.opportunity_id)
    .slice()
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const earliestFollowUpIdByOpportunity = new Map<string, string>();
  for (const followUp of pendingSortedAscending) {
    if (!earliestFollowUpIdByOpportunity.has(followUp.opportunity_id!)) {
      earliestFollowUpIdByOpportunity.set(followUp.opportunity_id!, followUp.id);
    }
  }

  return opportunities.map((opportunity) => {
    const signals = signalsByOpportunityId.get(opportunity.id);
    return {
      ...opportunity,
      agentName: opportunity.assigned_agent_id ? (agentNameById.get(opportunity.assigned_agent_id) ?? "Unassigned") : "Unassigned",
      lastCallOutcome: signals?.last_call_outcome ?? null,
      latestNote: signals?.last_note_summary ?? opportunity.notes,
      followUpId: earliestFollowUpIdByOpportunity.get(opportunity.id) ?? null,
    };
  });
}

// "Most recently won first" (Client Won card).
export function sortByMostRecentlyWon(records: OpportunityCardRecord[]): OpportunityCardRecord[] {
  return records.slice().sort((a, b) => {
    const aTime = new Date(a.closed_at ?? a.created_at).getTime();
    const bTime = new Date(b.closed_at ?? b.created_at).getTime();
    return bTime - aTime;
  });
}

// "Most urgent first" (Follow-Ups Due / Overdue cards) - earliest due
// timestamp first, so an overdue-by-three-days record always sorts ahead
// of one due later today.
export function sortByMostUrgentFollowUp(records: OpportunityCardRecord[]): OpportunityCardRecord[] {
  return records.slice().sort((a, b) => {
    const aTime = a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : Infinity;
    const bTime = b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : Infinity;
    return aTime - bTime;
  });
}
