import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashLeadgenAppointmentToken } from "@/lib/leadgen-appointment-notifications";
import { generateAvailableSlots } from "@/lib/leadgen-scheduling";
import type { LeadgenAppointmentRow, LeadgenClientRow } from "@/lib/leadgen-types";
import ManageAppointmentClient from "./ManageAppointmentClient";

function isTokenActive(token: { revoked_at: string | null; expires_at: string }): boolean {
  return !token.revoked_at && new Date(token.expires_at).getTime() > Date.now();
}

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Winsalot Corp</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">This link is no longer available</h1>
        <p className="mt-3 text-sm text-slate-600">The link may have expired. Please contact us directly if you need to make a change.</p>
      </div>
    </div>
  );
}

// Public, unauthenticated "manage my booking" page reached from the
// reschedule/cancel link in the confirmation email - same token-gated,
// service-role-client pattern as /customer-quote/[token] and
// /book-consultation above.
export default async function ManageAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = getSupabaseAdmin();
  const tokenHash = hashLeadgenAppointmentToken(token);

  const { data: tokenRow } = await admin
    .from("leadgen_appointment_tokens")
    .select("id, appointment_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !isTokenActive(tokenRow)) return <InvalidLink />;

  const { data: appointment } = await admin.from("leadgen_appointments").select("*").eq("id", tokenRow.appointment_id).maybeSingle();
  if (!appointment) return <InvalidLink />;

  const { data: client } = await admin.from("leadgen_clients").select("*").eq("id", appointment.client_id).maybeSingle();
  if (!client) return <InvalidLink />;

  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + 21 * 24 * 60 * 60 * 1000);
  const { data: existing } = await admin
    .from("leadgen_appointments")
    .select("appointment_date, appointment_time, status")
    .eq("client_id", client.id)
    .neq("id", appointment.id)
    .gte("appointment_date", windowStart.toISOString().slice(0, 10))
    .lte("appointment_date", windowEnd.toISOString().slice(0, 10));

  const availableSlots = generateAvailableSlots((existing ?? []).map((a) => ({ date: a.appointment_date, time: a.appointment_time, status: a.status })));

  return (
    <ManageAppointmentClient
      token={token}
      clientName={(client as LeadgenClientRow).name}
      appointment={appointment as LeadgenAppointmentRow}
      availableSlots={availableSlots}
    />
  );
}
