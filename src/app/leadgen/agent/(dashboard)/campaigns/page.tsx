import { notFound } from "next/navigation";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  workspaceCampaigns,
  loadCampaignWorkspace,
} from "@/lib/leadgen-campaign-workspace";
import CampaignWorkspace from "@/components/leadgen/CampaignWorkspace";
import { createCampaignCallAction } from "./actions";
export default async function AgentCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const agent = await requireLeadgenAgent();
  const db = await createSupabaseServerClient();
  const campaigns = await workspaceCampaigns(db, agent.id);
  const { campaign } = await searchParams;
  if (campaign && !campaigns.some((c) => c.id === campaign)) notFound();
  const data = await loadCampaignWorkspace(db, campaigns, campaign, agent.id);
  return (
    <CampaignWorkspace
      campaigns={campaigns}
      data={data}
      logCallAction={
        campaign ? createCampaignCallAction.bind(null, campaign) : undefined
      }
    />
  );
}
