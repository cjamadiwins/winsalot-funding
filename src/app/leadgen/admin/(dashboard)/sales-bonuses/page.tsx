import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUpcomingPaydays, formatDateShort } from "@/lib/payroll";
import { loadSalesBonuses, loadSalesBonusPrograms } from "@/lib/sales-bonus-data";
import { saleConfirmationState, formatBonusAmount, SALES_BONUS_FUNDING_LABELS, type ConfirmableAppointment } from "@/lib/sales-bonus";
import SalesBonusAdminSection from "@/components/payroll/SalesBonusAdminSection";
import SalesConversionControl from "@/components/leadgen/SalesConversionControl";

type AppointmentRow = ConfirmableAppointment & { business_name: string; appointment_date: string; client_id: string };

export default async function LeadgenSalesBonusesPage() {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: bonuses, error }, programs] = await Promise.all([loadSalesBonuses(supabase), loadSalesBonusPrograms(supabase)]);
  const programByClient = new Map(programs.map((p) => [p.client_id, p]));
  const programClientIds = new Set(programByClient.keys());

  const [{ data: appointments }, { data: clients }, { data: agents }] = programClientIds.size
    ? await Promise.all([
        supabase
          .from("leadgen_appointments")
          .select("id, client_id, lead_id, status, booking_agent_id, business_name, appointment_date")
          .in("client_id", [...programClientIds])
          .not("status", "in", "(Cancelled,Replaced,No-show)")
          .order("appointment_date", { ascending: false })
          .limit(500),
        supabase.from("leadgen_clients").select("id, name").in("id", [...programClientIds]),
        supabase.from("leadgen_users").select("id, full_name, email").eq("role", "agent"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name as string]));
  const agentName = new Map((agents ?? []).map((a) => [a.id, (a.full_name as string) || (a.email as string)]));
  const candidates = ((appointments ?? []) as AppointmentRow[])
    .map((a) => ({ appointment: a, state: saleConfirmationState(a, programClientIds, bonuses) }))
    .filter((c) => c.state.kind === "confirmable");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Sales Conversion Bonuses</h1>
      <p className="mt-1 text-sm text-slate-500">
        Confirm which appointments resulted in a sale. Each confirmed sale earns the credited agent CA$50, tracked here and in Growth CRM payroll.
        Only Admin can confirm a sale or approve a bonus.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-lg font-bold text-slate-900">Appointments awaiting sale confirmation</h2>
        <p className="mt-1 text-sm text-slate-500">
          Appointments for clients with a bonus program ({programs.map((p) => `${clientName.get(p.client_id) ?? "Client"}: ${SALES_BONUS_FUNDING_LABELS[p.funding_model]}, ${formatBonusAmount(p.bonus_amount, p.currency)}`).join("; ") || "none configured"}).
          Already-confirmed sales are not listed, so a bonus cannot be created twice.
        </p>
        {candidates.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No appointments are waiting for sale confirmation.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {candidates.map(({ appointment, state }) => (
              <li key={appointment.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{appointment.business_name}</p>
                  <p className="text-xs text-slate-500">
                    {clientName.get(appointment.client_id)} · {formatDateShort(appointment.appointment_date)} · {appointment.status} · credited to {agentName.get(appointment.booking_agent_id ?? "") ?? "agent"}
                  </p>
                </div>
                <SalesConversionControl appointmentId={appointment.id} state={state} agentName={agentName.get(appointment.booking_agent_id ?? "")} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Failed to load bonuses: {error.message}</p>
        ) : (
          <SalesBonusAdminSection rows={bonuses} paydays={getUpcomingPaydays(4)} />
        )}
      </div>
    </div>
  );
}
