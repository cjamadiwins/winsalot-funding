import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { lookupWinsalotActionToken } from "@/lib/winsalot-consultation-tokens";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";
import CancelClient from "./CancelClient";

export const dynamic = "force-dynamic";

// Public, unauthenticated cancellation page reached via the secure,
// expiring, single-use-on-submit cancel token embedded in every
// confirmation/reminder email.
export default async function CancelAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lookup = await lookupWinsalotActionToken(token, "cancel");

  if (!lookup.ok) {
    return <ErrorShell message={lookup.error} />;
  }

  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", lookup.appointmentId).maybeSingle();

  if (!appointment) return <ErrorShell message="This appointment could not be found." />;
  const appt = appointment as WinsalotAppointmentRow;
  if (appt.status === "cancelled") {
    return <ErrorShell message="This consultation has already been cancelled." />;
  }

  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: appt.prospect_timezone || appt.business_timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(appt.appointment_start_at));

  return <CancelClient token={token} contactName={appt.contact_name} appointmentLabel={label} />;
}

function ErrorShell({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-bold text-slate-900">Winsalot Corp</h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}
