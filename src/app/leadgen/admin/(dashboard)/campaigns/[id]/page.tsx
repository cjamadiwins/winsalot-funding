import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveSiteRelativeUrl } from "@/lib/site-url";
import {
  isHiddenLeadgenCampaignName,
  type LeadgenAppointmentRow,
  type LeadgenCampaignAgentRow,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenLeadRow,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import CampaignDetailClient from "./CampaignDetailClient";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: campaign } = await admin.from("leadgen_campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign || isHiddenLeadgenCampaignName(campaign.name)) notFound();

  const [{ data: client }, { data: leads }, { data: appointments }, { data: agents }, { data: assignedAgents }] = await Promise.all([
    admin.from("leadgen_clients").select("*").eq("id", campaign.client_id).maybeSingle(),
    admin.from("leadgen_leads").select("*").eq("campaign_id", id).order("created_at", { ascending: false }),
    admin.from("leadgen_appointments").select("*").eq("campaign_id", id),
    admin.from("leadgen_users").select("*").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL).order("full_name"),
    admin.from("leadgen_campaign_agents").select("*").eq("campaign_id", id),
  ]);

  const bookingLink = client ? resolveSiteRelativeUrl((client as LeadgenClientRow).booking_link) : null;

  return (
    <CampaignDetailClient
      campaign={campaign as LeadgenCampaignRow}
      client={client as LeadgenClientRow}
      leads={(leads ?? []) as LeadgenLeadRow[]}
      appointments={(appointments ?? []) as LeadgenAppointmentRow[]}
      agents={(agents ?? []) as LeadgenUserRow[]}
      assignedAgents={(assignedAgents ?? []) as LeadgenCampaignAgentRow[]}
      bookingLink={bookingLink}
    />
  );
}
