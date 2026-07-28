import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenAppointmentRow, LeadgenCampaignRow, LeadgenClientRow, LeadgenLeadRow, LeadgenUserRow } from "@/lib/leadgen-types";
import AppointmentsListClient from "./AppointmentsListClient";

export default async function LeadgenAppointmentsPage({ searchParams }: { searchParams: Promise<{ highlight?: string }> }) {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { highlight } = await searchParams;

  const [{ data: appointments }, { data: clients }, { data: campaigns }, { data: agents }, { data: leads }] = await Promise.all([
    admin.from("leadgen_appointments").select("*").order("appointment_date", { ascending: false }),
    admin.from("leadgen_clients").select("*").order("name"),
    admin.from("leadgen_campaigns").select("*").order("name"),
    admin.from("leadgen_users").select("*").eq("role", "agent").eq("active", true).order("full_name"),
    admin.from("leadgen_leads").select("id, business_name, client_id, campaign_id, contact_name, phone, email").order("business_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
      <p className="mt-1 text-sm text-slate-500">Every consultation booked across every client.</p>

      <AppointmentsListClient
        appointments={(appointments ?? []) as LeadgenAppointmentRow[]}
        clients={(clients ?? []) as LeadgenClientRow[]}
        campaigns={(campaigns ?? []) as LeadgenCampaignRow[]}
        agents={(agents ?? []) as LeadgenUserRow[]}
        leads={(leads ?? []) as Pick<LeadgenLeadRow, "id" | "business_name" | "client_id" | "campaign_id" | "contact_name" | "phone" | "email">[]}
        highlightId={highlight}
      />
    </div>
  );
}
