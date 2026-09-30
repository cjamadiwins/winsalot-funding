import { GROWTH_CRM_CAMPAIGN_KEYS, isGrowthCrmCampaignKey, type GrowthCrmCampaignKey } from "./growth-crm-campaign-scripts";

// Client-safe helpers for the per-list call script (both CRMs). The script for a
// list is Admin-managed data (call_list_segments.call_script_key / _text), so it
// can change without a deploy; the built-in Growth templates are only the
// starting library.

export const CALL_SCRIPT_MAX_LENGTH = 8000;

// Growth: the template a list uses. Falls back to the service's own script only
// for Business Finance (there is exactly one); Lead Generation lists without an
// explicit key have no template until Admin picks one.
export function resolveGrowthScriptKey(segment: { call_script_key: string | null; growth_opportunity_type: string | null }): GrowthCrmCampaignKey | null {
  if (segment.call_script_key && isGrowthCrmCampaignKey(segment.call_script_key)) return segment.call_script_key;
  if (segment.growth_opportunity_type === "business_financing") return "business-finance";
  return null;
}

export function normalizeScriptText(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  return trimmed ? trimmed : null;
}

export function isValidGrowthScriptKey(value: string | null): value is GrowthCrmCampaignKey | null {
  return value === null || (GROWTH_CRM_CAMPAIGN_KEYS as readonly string[]).includes(value);
}

export function substituteAgentName(text: string, agentName: string): string {
  return text.replace(/\[Agent Name\]/gi, agentName.trim() || "[Agent Name]");
}
