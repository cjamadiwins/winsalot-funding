import type { KpiTone } from "@/components/crm-ui/KpiCard";

// Opportunity Finder: shared, pure types/helpers used by both CRMs'
// scoring tables (crm_opportunity_scores / leadgen_opportunity_scores -
// see supabase/migrations/0112 and 0113, priority categories reworked by
// 0149). Deliberately a shared, DB-agnostic module rather than duplicated
// per CRM, the same pattern src/lib/leave-requests.ts already uses for the
// two CRMs' identically-shaped leave request tables - the row shape and
// scoring rules are conceptually identical, only the underlying lead table
// (crm_opportunities vs leadgen_leads) differs, and that difference is
// captured by each CRM's own extended row type below rather than by
// duplicating this file.

// Four rule-based priority buckets (migration 0149) - Hot/Warm/Follow-Up/
// Retry, ordered highest-priority first, plus Closed for anything that's
// no longer an active opportunity (won, not interested, or an appointment
// already booked with nothing else outstanding). A prospect only ever
// lands in Hot from an explicit interest/buying signal, never from call
// volume alone - see the scoring engine's own comments (migration 0149).
export const OPPORTUNITY_CATEGORIES = ["hot", "warm", "follow_up", "retry", "closed"] as const;
export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export const OPPORTUNITY_CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  hot: "Hot",
  warm: "Warm",
  follow_up: "Follow-Up",
  retry: "Retry",
  closed: "Closed / Not Opportunity",
};

// Short "why this bucket" copy, shown alongside the label wherever there's
// room (e.g. filter tooltips) - mirrors the brief's own bucket definitions.
export const OPPORTUNITY_CATEGORY_DESCRIPTIONS: Record<OpportunityCategory, string> = {
  hot: "Shown interest, asked for information, or a positive conversation - may be ready to convert.",
  warm: "Requested a callback, asked to speak with the owner, or a meaningful conversation not yet ready to book.",
  follow_up: "A scheduled follow-up is due today or overdue.",
  retry: "No answer, voicemail, or gatekeeper - still worth another attempt.",
  closed: "Won, not interested, or an appointment is already booked with nothing else outstanding.",
};

export const OPPORTUNITY_CATEGORY_STYLES: Record<OpportunityCategory, string> = {
  hot: "bg-red-100 text-red-800",
  warm: "bg-orange-100 text-orange-800",
  follow_up: "bg-sky-100 text-sky-800",
  retry: "bg-slate-100 text-slate-700",
  closed: "bg-gray-200 text-gray-600",
};

export const OPPORTUNITY_CATEGORY_KPI_TONE: Record<OpportunityCategory, KpiTone> = {
  hot: "red",
  warm: "orange",
  follow_up: "cyan",
  retry: "slate",
  closed: "rose",
};

export const OPPORTUNITY_AGENT_STATUSES = [
  "new",
  "contacted",
  "follow_up",
  "interested",
  "appointment_booked",
  "closed",
] as const;
export type OpportunityAgentStatus = (typeof OPPORTUNITY_AGENT_STATUSES)[number];

export const OPPORTUNITY_AGENT_STATUS_LABELS: Record<OpportunityAgentStatus, string> = {
  new: "New",
  contacted: "Contacted",
  follow_up: "Follow-Up",
  interested: "Interested",
  appointment_booked: "Appointment Booked",
  closed: "Closed",
};

export const OPPORTUNITY_AGENT_STATUS_STYLES: Record<OpportunityAgentStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  contacted: "bg-sky-100 text-sky-800",
  follow_up: "bg-orange-100 text-orange-800",
  interested: "bg-indigo-100 text-indigo-800",
  appointment_booked: "bg-purple-100 text-purple-800",
  closed: "bg-rose-100 text-rose-800",
};

export type OpportunityFinderState = "active" | "dismissed";

export type OpportunityPriorityOverride = "hot" | "warm" | "follow_up" | "retry";

// The admin priority-override dropdown's own options, in the same
// highest-first order as OPPORTUNITY_CATEGORIES minus "closed" (dismissing
// is its own separate action, not a priority override) - one list shared
// by both CRMs' admin Opportunity Finder so the option set can't drift.
export const PRIORITY_OVERRIDE_OPTIONS: OpportunityPriorityOverride[] = ["hot", "warm", "follow_up", "retry"];

// Common shape of one row in either scoring table, minus the FK column
// (opportunity_id vs lead_id) - each CRM's own type file extends this with
// that one field (see CrmOpportunityScoreRow / LeadgenOpportunityScoreRow
// below).
export type OpportunityScoreRow = {
  id: string;
  created_at: string;
  updated_at: string;
  score: number;
  category: OpportunityCategory;
  priority_override: "hot" | "warm" | "follow_up" | "retry" | null;
  reasons: string[];
  recommended_action: string;
  signals: Record<string, unknown>;
  agent_status: OpportunityAgentStatus;
  finder_state: OpportunityFinderState;
  dismissed_at: string | null;
  dismissed_by: string | null;
  dismissed_reason: string | null;
  reopened_at: string | null;
  last_scored_at: string;
};

export type CrmOpportunityScoreRow = OpportunityScoreRow & { opportunity_id: string };
export type LeadgenOpportunityScoreRow = OpportunityScoreRow & { lead_id: string };

// The category actually shown/filtered on: an admin's manual priority
// override always wins over the computed category, and a dismissed row is
// always shown as Closed regardless of what it last scored - one place so
// every list/counter/filter agrees.
export function effectiveOpportunityCategory(
  row: Pick<OpportunityScoreRow, "category" | "priority_override" | "finder_state">
): OpportunityCategory {
  if (row.finder_state === "dismissed") return "closed";
  return row.priority_override ?? row.category;
}

export function opportunityScoreRingColor(score: number): string {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F5A623";
  return "#94A3B8";
}
