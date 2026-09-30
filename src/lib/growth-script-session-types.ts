import type { GrowthCrmCampaignKey } from "@/lib/growth-crm-campaign-scripts";

// One assigned Growth call list's approved script context. Growth ownership is
// Winsalot Corp -> Campaign/List -> Agent(s) -> Leads, so there is no client.
export type GrowthScriptSessionPayload = {
  segmentId: string;
  segmentName: string;
  campaignName: string | null;
  serviceKey: GrowthCrmCampaignKey | null;
  // Human label for the service/campaign type, e.g. "Website Development / Web Design".
  serviceLabel: string;
  // Admin's custom list script; when set it replaces the service template.
  scriptText: string | null;
};
