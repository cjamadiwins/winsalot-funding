import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenAppointmentRow, LeadgenAppointmentStatus } from "@/lib/leadgen-types";
import type { LeadgenConversionRow } from "@/lib/leadgen-conversions";
import ConversionsListClient, { type ConversionListRow } from "./ConversionsListClient";
import { confirmClientReportAction, rejectClientReportAction, updateConversionStatusAction } from "./actions";

// Admin Conversions page (brief "ADMIN FUNCTIONALITY") - the single place
// Admin tracks every Winsalot-generated lead from appointment through
// actual paying-customer conversion. Deliberately loaded via separate
// queries joined in JS (not a PostgREST embedded join) the same way the
// admin dashboard already assembles leads/appointments/clients/campaigns/
// agents - leadgen_conversions has several FKs into leadgen_users alone
// (agent_id, conversion_status_set_by, client_reported_by, updated_by,
// duplicate_override_by), which would need explicit relationship
// disambiguation for an embedded join; plain maps are simpler and match
// the rest of this CRM's admin pages.
export default async function AdminConversionsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireLeadgenAdmin();
  const { filter } = await searchParams;
  const admin = getSupabaseAdmin();

  const [{ data: conversions }, { data: appointments }, { data: clients }, { data: campaigns }, { data: users }, { data: leads }] = await Promise.all([
    admin.from("leadgen_conversions").select("*").order("updated_at", { ascending: false }),
    admin.from("leadgen_appointments").select("id, business_name, contact_name, appointment_date, appointment_time, status"),
    admin.from("leadgen_clients").select("id, name"),
    admin.from("leadgen_campaigns").select("id, name"),
    admin.from("leadgen_users").select("id, full_name"),
    admin.from("leadgen_leads").select("id, business_name"),
  ]);

  const appointmentById = new Map((appointments ?? []).map((a) => [a.id, a as Pick<LeadgenAppointmentRow, "id" | "business_name" | "contact_name" | "appointment_date" | "appointment_time" | "status">]));
  const clientNameById = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));
  const campaignNameById = new Map((campaigns ?? []).map((c) => [c.id as string, c.name as string]));
  const userNameById = new Map((users ?? []).map((u) => [u.id as string, u.full_name as string]));
  const leadBusinessNameById = new Map((leads ?? []).map((l) => [l.id as string, l.business_name as string]));

  const rows: ConversionListRow[] = ((conversions ?? []) as LeadgenConversionRow[]).map((conversion) => {
    const appointment = appointmentById.get(conversion.appointment_id);
    const businessName = appointment?.business_name ?? (conversion.lead_id ? leadBusinessNameById.get(conversion.lead_id) : null) ?? "Unknown Prospect";
    return {
      conversion,
      businessName,
      contactName: appointment?.contact_name ?? null,
      appointmentDate: appointment?.appointment_date ?? null,
      appointmentTime: appointment?.appointment_time ?? null,
      appointmentStatus: (appointment?.status as LeadgenAppointmentStatus | undefined) ?? null,
      clientName: clientNameById.get(conversion.client_id) ?? "Unknown Client",
      campaignName: conversion.campaign_id ? (campaignNameById.get(conversion.campaign_id) ?? null) : null,
      agentName: conversion.agent_id ? (userNameById.get(conversion.agent_id) ?? null) : null,
      updatedByName: conversion.updated_by ? (userNameById.get(conversion.updated_by) ?? null) : null,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Conversions</h1>
      <p className="mt-1 text-sm text-slate-500">
        Track every Winsalot-generated lead from appointment through actual paying-customer conversion. An appointment being booked or completed never
        counts as a conversion by itself - only a confirmed paying customer does.
      </p>

      <div className="mt-6">
        <ConversionsListClient
          rows={rows}
          initialFilter={filter}
          actions={{
            updateConversionStatus: updateConversionStatusAction,
            confirmClientReport: confirmClientReportAction,
            rejectClientReport: rejectClientReportAction,
          }}
        />
      </div>
    </div>
  );
}
