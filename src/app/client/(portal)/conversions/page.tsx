import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenConversionRow } from "@/lib/leadgen-conversions";
import type { LeadgenAppointmentRow } from "@/lib/leadgen-types";
import ConversionsPortalClient, { type ClientConversionRow } from "./ConversionsPortalClient";

// Client Portal "Conversions" section (brief). Every query here is scoped
// to `.eq("client_id", client.id)` in addition to RLS
// (leadgen_conversions_client_select_own) - defense in depth, same
// pattern as every other Client Portal page in this app. Never queries or
// renders anything beyond this client's own business name / appointment
// date / conversion status / last-updated - no other client's data, no
// internal Winsalot notes, no agent performance info, and no internal
// billing logic (admin_sale_amount/admin_notes/payment-trigger data) ever
// reaches this page.
export default async function ClientPortalConversionsPage() {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const { data: conversions } = await supabase
    .from("leadgen_conversions")
    .select("*")
    .eq("client_id", client.id)
    .order("updated_at", { ascending: false });

  const conversionRows = (conversions ?? []) as LeadgenConversionRow[];
  const appointmentIds = conversionRows.map((c) => c.appointment_id);
  const { data: appointments } =
    appointmentIds.length > 0
      ? await supabase.from("leadgen_appointments").select("id, business_name, appointment_date, appointment_time").in("id", appointmentIds).eq("client_id", client.id)
      : { data: [] as Pick<LeadgenAppointmentRow, "id" | "business_name" | "appointment_date" | "appointment_time">[] };

  const appointmentById = new Map((appointments ?? []).map((a) => [a.id, a]));

  const rows: ClientConversionRow[] = conversionRows.map((c) => {
    const appointment = appointmentById.get(c.appointment_id);
    return {
      conversionId: c.id,
      businessName: appointment?.business_name ?? "Unknown Prospect",
      appointmentDate: appointment?.appointment_date ?? null,
      appointmentTime: appointment?.appointment_time ?? null,
      conversionStatus: c.conversion_status,
      updatedAt: c.updated_at,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Conversions</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your Winsalot-generated opportunities and what happened after each appointment. Report a conversion once a prospect has moved forward - your
        report is reviewed by Winsalot Corp before anything is finalized.
      </p>

      <ConversionsPortalClient rows={rows} />
    </div>
  );
}
