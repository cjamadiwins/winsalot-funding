import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GROWTH_CRM_CAMPAIGN_KEYS, type GrowthCrmCampaignKey } from "./growth-crm-campaign-scripts";
import { resolveGrowthScriptKey } from "./call-list-script-shared";

// The Quick Call Script campaigns a Growth agent may see/select: only those tied
// to Growth call lists they are currently assigned to. Read through the agent's
// own session client so the segment RLS (roster + Admin's service assignment)
// does the scoping - remove the agent from a list (or change their service) and
// the campaign's script disappears with it.
export async function loadAgentScriptKeys(supabase: SupabaseClient): Promise<GrowthCrmCampaignKey[]> {
  const { data } = await supabase
    .from("call_list_segments")
    .select("call_script_key, growth_opportunity_type")
    .eq("crm", "growth")
    .in("status", ["active", "completed"]);
  const keys = new Set<GrowthCrmCampaignKey>();
  for (const row of data ?? []) {
    const key = resolveGrowthScriptKey({ call_script_key: (row.call_script_key as string | null) ?? null, growth_opportunity_type: (row.growth_opportunity_type as string | null) ?? null });
    if (key) keys.add(key);
  }
  return GROWTH_CRM_CAMPAIGN_KEYS.filter((k) => keys.has(k));
}
