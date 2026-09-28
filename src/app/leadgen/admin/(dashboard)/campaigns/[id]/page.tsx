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
import { buildLeadgenConversionFunnel, type LeadgenConversionRow } from "@/lib/leadgen-conversions";
import { getWebsiteLaunchReadiness, WEBSITE_LAUNCH_CLIENTS } from "@/lib/leadgen-launch-readiness";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: campaign } = await admin.from("leadgen_campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign || isHiddenLeadgenCampaignName(campaign.name)) notFound();

  const [{ data: client }, { data: leads }, { data: appointments }, { data: agents }, { data: assignedAgents }, { data: conversions }] = await Promise.all([
    admin.from("leadgen_clients").select("*").eq("id", campaign.client_id).maybeSingle(),
    admin.from("leadgen_leads").select("*").eq("campaign_id", id).order("created_at", { ascending: false }),
    admin.from("leadgen_appointments").select("*").eq("campaign_id", id),
    admin.from("leadgen_users").select("*").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL).order("full_name"),
    admin.from("leadgen_campaign_agents").select("*").eq("campaign_id", id),
    // Client Campaign View post-appointment funnel (brief "CLIENT CAMPAIGN
    // VIEW") - additive, never replaces the existing lead-to-appointment
    // "Conversion Rate" KPI card above.
    admin.from("leadgen_conversions").select("conversion_status").eq("campaign_id", id),
  ]);

  const bookingLink = client ? resolveSiteRelativeUrl((client as LeadgenClientRow).booking_link) : null;
  const conversionFunnel = buildLeadgenConversionFunnel((conversions ?? []) as Pick<LeadgenConversionRow, "conversion_status">[]);
  const launchReadiness = client && WEBSITE_LAUNCH_CLIENTS.includes(client.name as (typeof WEBSITE_LAUNCH_CLIENTS)[number])
    ? await getWebsiteLaunchReadiness(client.id) : null;

  return (
    <CampaignDetailClient
      campaign={campaign as LeadgenCampaignRow}
      client={client as LeadgenClientRow}
      leads={(leads ?? []) as LeadgenLeadRow[]}
      appointments={(appointments ?? []) as LeadgenAppointmentRow[]}
      agents={(agents ?? []) as LeadgenUserRow[]}
      assignedAgents={(assignedAgents ?? []) as LeadgenCampaignAgentRow[]}
      bookingLink={bookingLink}
      conversionFunnel={conversionFunnel}
      launchReadiness={launchReadiness}
    />
  );
}
