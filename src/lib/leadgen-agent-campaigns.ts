// The Lead Generation agent dashboard's "Current Campaign" selector only
// ever shows the campaigns listed here, keyed by campaign id - never by
// matching on the campaign's free-text `name` column, which an admin can
// edit at any time (and which is exactly what made the old dropdown show
// the raw campaign name and silently fail to hide "Q3 Growth Campaign").
// The dropdown's own label always comes from the campaign's related
// leadgen_clients.name, not from anything hardcoded here.
//
// Adding a client/campaign to this map is a deliberate, reviewed step -
// it also has to have a call script wired up in leadgen-call-scripts.tsx
// and rendered by AgentCampaignSelector, so a new campaign never appears
// selectable without one.
export type LeadgenAgentCampaignScriptKey = "brents-essentials" | "mantra-collab";

export const LEADGEN_AGENT_DASHBOARD_CAMPAIGN_SCRIPTS: Readonly<Record<string, LeadgenAgentCampaignScriptKey>> = {
  "cbf3ea01-9eb0-4b24-8d9e-aa203d435651": "brents-essentials", // Brent's Essentials — Growth Consultation
  "4029a1df-0c65-4ec9-a5ff-b2078df935cd": "mantra-collab", // Mantra Collab Business Applications
};

export function isLeadgenAgentDashboardCampaignId(campaignId: string): boolean {
  return campaignId in LEADGEN_AGENT_DASHBOARD_CAMPAIGN_SCRIPTS;
}
