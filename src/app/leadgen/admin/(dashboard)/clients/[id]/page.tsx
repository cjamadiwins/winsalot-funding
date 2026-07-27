import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenCampaignRow, LeadgenClientRow, LeadgenEmailRow, LeadgenEmailTemplateRow } from "@/lib/leadgen-types";
import ClientDetailClient from "./ClientDetailClient";

export default async function LeadgenClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const [{ data: client }, { data: campaigns }, { data: emails }, { data: templates }, { data: leads }] = await Promise.all([
    admin.from("leadgen_clients").select("*").eq("id", id).maybeSingle(),
    admin.from("leadgen_campaigns").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    admin
      .from("leadgen_emails")
      .select("*")
      .eq("client_id", id)
      .is("lead_id", null)
      .order("created_at", { ascending: false }),
    admin.from("leadgen_email_templates").select("*").eq("active", true).order("name"),
    admin.from("leadgen_leads").select("id, campaign_id, status").eq("client_id", id),
  ]);

  if (!client) notFound();

  const leadCountByCampaign = new Map<string, number>();
  for (const lead of leads ?? []) {
    if (!lead.campaign_id) continue;
    leadCountByCampaign.set(lead.campaign_id, (leadCountByCampaign.get(lead.campaign_id) ?? 0) + 1);
  }

  return (
    <ClientDetailClient
      client={client as LeadgenClientRow}
      campaigns={(campaigns ?? []) as LeadgenCampaignRow[]}
      emails={(emails ?? []) as LeadgenEmailRow[]}
      templates={(templates ?? []) as LeadgenEmailTemplateRow[]}
      leadCountByCampaign={Object.fromEntries(leadCountByCampaign)}
      totalLeads={(leads ?? []).length}
    />
  );
}
