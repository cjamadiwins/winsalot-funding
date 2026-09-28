import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LEADGEN_CONVERSION_STATUS_LABELS,
  LEADGEN_CONVERSION_STATUS_STYLES,
  type LeadgenConversionRow,
} from "@/lib/leadgen-conversions";
import type { LeadgenAppointmentRow } from "@/lib/leadgen-types";

// Agent read-only Conversion outcomes (brief "AGENT FUNCTIONALITY") -
// agents may VIEW the seven pipeline stages for leads they generated, but
// have no confirm/reject/edit controls at all (only Admin can act on a
// conversion record - see /leadgen/admin/conversions/actions.ts). RLS
// (leadgen_conversions_agent_select_own, the migration) already scopes
// this session-scoped query to only conversions tied to a lead assigned
// to this agent or an appointment they're the specialist on - no
// additional filtering needed here for that guarantee.
export default async function AgentConversionsPage() {
  await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: conversions } = await supabase.from("leadgen_conversions").select("*").order("updated_at", { ascending: false });
  const rows = (conversions ?? []) as LeadgenConversionRow[];

  const appointmentIds = Array.from(new Set(rows.map((r) => r.appointment_id)));
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
  const campaignIds = Array.from(new Set(rows.map((r) => r.campaign_id).filter((id): id is string => !!id)));

  const [{ data: appointments }, { data: clients }, { data: campaigns }] = await Promise.all([
    appointmentIds.length > 0
      ? supabase.from("leadgen_appointments").select("id, business_name, contact_name, appointment_date, appointment_time").in("id", appointmentIds)
      : Promise.resolve({ data: [] }),
    clientIds.length > 0 ? supabase.from("leadgen_clients").select("id, name").in("id", clientIds) : Promise.resolve({ data: [] }),
    campaignIds.length > 0 ? supabase.from("leadgen_campaigns").select("id, name").in("id", campaignIds) : Promise.resolve({ data: [] }),
  ]);

  const appointmentById = new Map((appointments ?? []).map((a) => [a.id, a as Pick<LeadgenAppointmentRow, "id" | "business_name" | "contact_name" | "appointment_date" | "appointment_time">]));
  const clientNameById = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));
  const campaignNameById = new Map((campaigns ?? []).map((c) => [c.id as string, c.name as string]));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Conversions</h1>
      <p className="mt-1 text-sm text-slate-500">
        Outcomes for the leads you generated, after their appointment. Only Admin can confirm a reported conversion or trigger client billing - this
        view is read-only.
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No conversion records yet for your leads.</p>
        ) : (
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-sm font-semibold uppercase text-slate-500">
                <th className="p-3">Prospect / Business</th>
                <th className="p-3">Client / Campaign</th>
                <th className="p-3">Appointment Date</th>
                <th className="p-3">Conversion Status</th>
                <th className="p-3">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const appointment = appointmentById.get(c.appointment_id);
                return (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{appointment?.business_name ?? "Unknown Prospect"}</div>
                      {appointment?.contact_name && <div className="text-sm text-slate-500">{appointment.contact_name}</div>}
                    </td>
                    <td className="p-3 text-slate-600">
                      <div>{clientNameById.get(c.client_id) ?? "—"}</div>
                      {c.campaign_id && <div className="text-sm text-slate-500">{campaignNameById.get(c.campaign_id) ?? "—"}</div>}
                    </td>
                    <td className="p-3 text-slate-600">
                      {appointment?.appointment_date ?? "—"} {appointment?.appointment_time ?? ""}
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${LEADGEN_CONVERSION_STATUS_STYLES[c.conversion_status]}`}>
                        {LEADGEN_CONVERSION_STATUS_LABELS[c.conversion_status]}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{new Date(c.updated_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
