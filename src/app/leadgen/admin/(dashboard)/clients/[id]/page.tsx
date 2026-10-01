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
import ClientPortalAdminPanel from "@/components/leadgen/appointment-prep/ClientPortalAdminPanel";
import AppointmentQualityInsights from "@/components/leadgen/appointment-prep/AppointmentQualityInsights";
import { computeFeedbackMetrics, computeQualityInsights, hasAppointmentPassed } from "@/lib/leadgen-appointment-prep";
import { fetchClientPortalLogins, fetchFeedbackRows } from "@/lib/leadgen-appointment-prep-data";
import ClientDetailClient from "./ClientDetailClient";

export default async function LeadgenClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requireLeadgenAdmin();
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

  // Client Portal strip + Appointment Quality Insights (Admin-only).
  const [portalLogins, feedbackRows, { data: timingRows }, { data: viewedRows }] = await Promise.all([
    fetchClientPortalLogins(admin, id),
    fetchFeedbackRows(admin, id),
    admin.from("leadgen_appointments").select("id, status, appointment_date, appointment_time, timezone, lead_id").eq("client_id", id).order("appointment_date", { ascending: false }),
    admin.from("leadgen_appointment_briefs").select("appointment_id, viewed_at").eq("client_id", id).not("viewed_at", "is", null).order("viewed_at", { ascending: false }).limit(1),
  ]);
  const timing = (timingRows ?? []) as { id: string; status: string; appointment_date: string; appointment_time: string; timezone: string; lead_id: string | null }[];
  const insightLeadIds = Array.from(new Set(timing.map((a) => a.lead_id).filter((v): v is string => Boolean(v))));
  const { data: insightLeads } = insightLeadIds.length
    ? await admin.from("leadgen_leads").select("id, industry, city, province").in("id", insightLeadIds)
    : { data: [] as { id: string; industry: string | null; city: string | null; province: string | null }[] };
  const leadById = new Map((insightLeads ?? []).map((l) => [l.id as string, l]));
  const insightContext: Record<string, { industry: string | null; location: string | null }> = {};
  for (const appt of timing) {
    const lead = appt.lead_id ? leadById.get(appt.lead_id) : null;
    insightContext[appt.id] = { industry: lead?.industry ?? null, location: lead ? [lead.city, lead.province].filter(Boolean).join(", ") || null : null };
  }
  // "Preview as Client" lands on the next appointment that still has a brief
  // to look at (most recent otherwise); falls back to the preview index.
  const previewTarget = timing.find((a) => !hasAppointmentPassed(a) && a.status !== "Cancelled" && a.status !== "Replaced") ?? timing[0];
  const previewHref = previewTarget
    ? `/leadgen/admin/clients/${id}/portal-preview/appointments/${previewTarget.id}`
    : `/leadgen/admin/clients/${id}/portal-preview`;

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
      adminName={adminUser.full_name || adminUser.email}
      portalPanel={
        <ClientPortalAdminPanel
          clientId={id}
          clientName={(client as LeadgenClientRow).name}
          logins={portalLogins}
          lastBriefViewedAt={(viewedRows?.[0]?.viewed_at as string | undefined) ?? null}
          previewHref={previewHref}
        />
      }
      insightsPanel={
        <AppointmentQualityInsights metrics={computeFeedbackMetrics(timing, feedbackRows)} insights={computeQualityInsights(feedbackRows, insightContext)} />
      }
    />
  );
}
