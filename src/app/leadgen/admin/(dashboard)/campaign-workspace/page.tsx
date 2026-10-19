import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  workspaceCampaigns,
  loadCampaignWorkspace,
} from "@/lib/leadgen-campaign-workspace";
import CampaignWorkspace from "@/components/leadgen/CampaignWorkspace";
export default async function AdminCampaignWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  await requireLeadgenAdmin();
  const db = await createSupabaseServerClient();
  const campaigns = await workspaceCampaigns(db);
  const { campaign } = await searchParams;
  if (campaign && !campaigns.some((c) => c.id === campaign)) notFound();
  return (
    <CampaignWorkspace
      campaigns={campaigns}
      data={await loadCampaignWorkspace(db, campaigns, campaign)}
      admin
    />
  );
}
