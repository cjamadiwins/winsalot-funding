"use server";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { workspaceCampaigns } from "@/lib/leadgen-campaign-workspace";
import { createLeadgenCallLogAction } from "../call-log/actions";
export async function createCampaignCallAction(
  campaignId: string,
  formData: FormData,
) {
  const agent = await requireLeadgenAgent();
  const campaigns = await workspaceCampaigns(
    await createSupabaseServerClient(),
    agent.id,
  );
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign)
    return { error: "Campaign unavailable or not assigned to you." };
  formData.set("client_id", campaign.client_id);
  formData.set("campaign_id", campaign.id);
  return createLeadgenCallLogAction(formData);
}
