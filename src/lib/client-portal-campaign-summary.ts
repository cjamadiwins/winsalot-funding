import type { LeadgenCampaignRow } from "./leadgen-types";

// Client Portal "Campaign Summary" - the overall client campaign, derived from
// the client's campaigns and live call lists. Individual call lists and the
// per-market leadgen_campaigns rows the imports create (e.g. "Hidebrandt Web
// Services — Brandon Pet Groomer / Pet Care") never become the main summary.
// Pure and display-only: nothing here reads or writes the database (the
// server loader lives in client-portal-campaign-summary-data.ts).

export type SummaryCampaign = Pick<
  LeadgenCampaignRow,
  "id" | "name" | "status" | "created_at" | "start_date" | "appointment_goal" | "qualification_criteria"
>;

// One call list belonging to one of the client's campaigns. agentNames must
// already be limited to ACTIVE agents (role = agent); leadCount is only
// required to be known as "0" or ">= 1".
export type SummaryCallList = {
  campaignId: string;
  status: string;
  deployedAt: string | null;
  leadCount: number;
  industry: string | null;
  territory: string | null;
  agentNames: string[];
};

export type SummaryAgreementTarget = {
  status: string;
  min: number | null;
  max: number | null;
  createdAt: string;
};

export type ClientCampaignSummary = {
  campaignName: string | null;
  status: LeadgenCampaignRow["status"] | null;
  assignedTeam: string[];
  targeting: string | null;
  appointmentTarget: string | null;
  campaignStart: string | null;
  qualificationCriteria: string[];
};

export const MULTIPLE_INDUSTRIES_LABEL = "Multiple Industries";
export const MULTIPLE_MARKETS_LABEL = "Multiple Markets";

// There is no parent/umbrella column in the schema (leadgen_campaigns has none,
// and campaign_type/service_type are unset on real clients), so the client-level
// campaign is the client's OLDEST campaign - the umbrella is always created at
// onboarding, before any per-market row is imported. Ties break on id so the
// choice is stable.
export function pickUmbrellaCampaign<T extends Pick<SummaryCampaign, "id" | "created_at">>(campaigns: T[]): T | null {
  if (campaigns.length === 0) return null;
  return [...campaigns].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "Hidebrandt Web Services – Website Services Lead Generation" -> "Website
// Services Lead Generation". Falls back to the full name if nothing is left.
export function stripClientNamePrefix(campaignName: string, clientName: string): string {
  const trimmed = campaignName.trim();
  const stripped = trimmed.replace(new RegExp(`^${escapeRegExp(clientName.trim())}\\s*[–—-]\\s*`, "i"), "").trim();
  return stripped || trimmed;
}

// Overall status across all of the client's campaigns: Active if any is active,
// else Paused if any is paused, else Completed.
export function deriveOverallStatus(campaigns: Pick<SummaryCampaign, "status">[]): LeadgenCampaignRow["status"] | null {
  if (campaigns.length === 0) return null;
  if (campaigns.some((c) => c.status === "active")) return "active";
  if (campaigns.some((c) => c.status === "paused")) return "paused";
  return "completed";
}

// Assigned Team = unique, active agents holding a qualifying production list for
// this client: list is active, deployed and has >= 1 lead, and its campaign is
// active. Draft/archived/undeployed/empty lists, paused or completed campaigns,
// inactive agents (filtered by the loader) and the internal test client are
// excluded. Never hard-codes names - it follows the live assignments.
export function deriveAssignedTeam(
  campaigns: Pick<SummaryCampaign, "id" | "status">[],
  lists: SummaryCallList[],
  isInternalTest: boolean,
): string[] {
  if (isInternalTest) return [];
  const activeCampaignIds = new Set(campaigns.filter((c) => c.status === "active").map((c) => c.id));
  const names = new Map<string, string>();
  for (const list of lists) {
    if (!isQualifyingProductionList(list, activeCampaignIds)) continue;
    for (const raw of list.agentNames) {
      const name = raw.trim();
      if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function isQualifyingProductionList(list: SummaryCallList, activeCampaignIds: Set<string>): boolean {
  return activeCampaignIds.has(list.campaignId) && list.status === "active" && list.deployedAt !== null && list.leadCount > 0;
}

function distinct(values: (string | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const value = raw?.trim();
    if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  }
  return [...seen.values()];
}

// Simple client-facing targeting line. One distinct industry / market is named;
// two or more collapse to "Multiple ...". Built from the client's active lists on
// active campaigns, so the line never depends on a single list.
export function deriveTargeting(campaigns: Pick<SummaryCampaign, "id" | "status">[], lists: SummaryCallList[]): string | null {
  const activeCampaignIds = new Set(campaigns.filter((c) => c.status === "active").map((c) => c.id));
  const live = lists.filter((l) => l.status === "active" && activeCampaignIds.has(l.campaignId));
  const industries = distinct(live.map((l) => l.industry));
  const markets = distinct(live.map((l) => l.territory));
  const parts = [
    industries.length > 1 ? MULTIPLE_INDUSTRIES_LABEL : industries[0],
    markets.length > 1 ? MULTIPLE_MARKETS_LABEL : markets[0],
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(" • ") : null;
}

// Signed agreement range first ("8–12"), then the umbrella campaign's own
// appointment_goal, then any campaign's goal; null (row hidden) otherwise.
export function deriveAppointmentTarget(
  agreements: SummaryAgreementTarget[],
  campaigns: SummaryCampaign[],
  umbrella: SummaryCampaign | null,
): string | null {
  const signed = agreements
    .filter((a) => a.status === "signed" && a.min !== null && a.max !== null && a.min > 0 && a.max >= a.min)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (signed) return signed.min === signed.max ? String(signed.min) : `${signed.min}–${signed.max}`;
  const goal = umbrella?.appointment_goal ?? campaigns.find((c) => c.appointment_goal !== null)?.appointment_goal ?? null;
  return goal !== null ? String(goal) : null;
}

export function buildClientCampaignSummary(input: {
  clientName: string;
  isInternalTest: boolean;
  campaigns: SummaryCampaign[];
  lists: SummaryCallList[];
  agreements: SummaryAgreementTarget[];
}): ClientCampaignSummary {
  const { clientName, campaigns, lists } = input;
  const umbrella = pickUmbrellaCampaign(campaigns);
  const starts = campaigns.map((c) => c.start_date).filter((d): d is string => Boolean(d)).sort();
  const criteriaSource =
    umbrella && umbrella.qualification_criteria?.length
      ? umbrella
      : [...campaigns].sort((a, b) => a.created_at.localeCompare(b.created_at)).find((c) => c.qualification_criteria?.length) ?? null;
  return {
    campaignName: umbrella ? stripClientNamePrefix(umbrella.name, clientName) : null,
    status: deriveOverallStatus(campaigns),
    assignedTeam: deriveAssignedTeam(campaigns, lists, input.isInternalTest),
    targeting: deriveTargeting(campaigns, lists),
    appointmentTarget: deriveAppointmentTarget(input.agreements, campaigns, umbrella),
    campaignStart: starts[0] ?? null,
    qualificationCriteria: criteriaSource?.qualification_criteria ?? [],
  };
}
