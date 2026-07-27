import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenAppointmentRow, LeadgenCampaignRow, LeadgenClientRow, LeadgenLeadRow } from "@/lib/leadgen-types";
import CampaignDetailClient from "./CampaignDetailClient";

export default async function LeadgenCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: campaign } = await admin.from("leadgen_campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign) notFound();

  const [{ data: client }, { data: leads }, { data: appointments }] = await Promise.all([
    admin.from("leadgen_clients").select("*").eq("id", campaign.client_id).maybeSingle(),
    admin.from("leadgen_leads").select("*").eq("campaign_id", id).order("created_at", { ascending: false }),
    admin.from("leadgen_appointments").select("*").eq("campaign_id", id),
  ]);

  return (
    <CampaignDetailClient
      campaign={campaign as LeadgenCampaignRow}
      client={client as LeadgenClientRow}
      leads={(leads ?? []) as LeadgenLeadRow[]}
      appointments={(appointments ?? []) as LeadgenAppointmentRow[]}
    />
  );
}
