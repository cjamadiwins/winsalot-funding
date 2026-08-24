import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  isHiddenLeadgenCampaignName,
  isLeadgenAppointmentCountable,
  isLeadgenNextFollowUpDueToday,
  isLeadgenNextFollowUpOverdue,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenEmailRow,
  type LeadgenEmailTemplateRow,
} from "@/lib/leadgen-types";
import ClientDetailClient from "./ClientDetailClient";

export default async function LeadgenClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const [{ data: client }, { data: campaigns }, { data: emails }, { data: templates }, { data: leads }, { data: appointments }, { data: bouncedRows }] =
    await Promise.all([
      admin.from("leadgen_clients").select("*").eq("id", id).maybeSingle(),
      admin.from("leadgen_campaigns").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      admin
        .from("leadgen_emails")
        .select("*")
        .eq("client_id", id)
        .is("lead_id", null)
        .order("created_at", { ascending: false }),
      admin.from("leadgen_email_templates").select("*").eq("active", true).order("name"),
      admin.from("leadgen_leads").select("id, campaign_id, status, next_follow_up_at").eq("client_id", id),
      admin.from("leadgen_appointments").select("status, campaign_id").eq("client_id", id),
      admin.from("leadgen_bounced_emails").select("email").is("cleared_at", null),
    ]);

  if (!client) notFound();

  const allLeads = leads ?? [];
  const allAppointments = appointments ?? [];
  const countableAppointments = allAppointments.filter((a) => isLeadgenAppointmentCountable(a.status));

  const leadCountByCampaign = new Map<string, number>();
  for (const lead of allLeads) {
    if (!lead.campaign_id) continue;
    leadCountByCampaign.set(lead.campaign_id, (leadCountByCampaign.get(lead.campaign_id) ?? 0) + 1);
  }
  const appointmentCountByCampaign = new Map<string, number>();
  for (const appt of countableAppointments) {
    if (!appt.campaign_id) continue;
    appointmentCountByCampaign.set(appt.campaign_id, (appointmentCountByCampaign.get(appt.campaign_id) ?? 0) + 1);
  }

  return (
    <ClientDetailClient
      client={client as LeadgenClientRow}
      campaigns={((campaigns ?? []).filter((campaign) => !isHiddenLeadgenCampaignName(campaign.name))) as LeadgenCampaignRow[]}
      emails={(emails ?? []) as LeadgenEmailRow[]}
      templates={(templates ?? []) as LeadgenEmailTemplateRow[]}
      leadCountByCampaign={Object.fromEntries(leadCountByCampaign)}
      appointmentCountByCampaign={Object.fromEntries(appointmentCountByCampaign)}
      totalLeads={allLeads.length}
      interestedLeads={allLeads.filter((l) => l.status === "Interested").length}
      appointmentsBooked={countableAppointments.length}
      followUpsDueToday={allLeads.filter((l) => isLeadgenNextFollowUpDueToday(l.next_follow_up_at)).length}
      overdueFollowUps={allLeads.filter((l) => isLeadgenNextFollowUpOverdue(l.next_follow_up_at)).length}
      bouncedEmails={(bouncedRows ?? []).map((r) => r.email)}
    />
  );
}
