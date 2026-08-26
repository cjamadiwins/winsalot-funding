import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { lookupWinsalotActionToken } from "@/lib/winsalot-consultation-tokens";
import { fetchWinsalotAvailabilitySettings, fetchWinsalotBlackouts } from "@/lib/winsalot-consultation-availability";
import { generateWinsalotBookingSlots } from "@/lib/winsalot-consultation-booking";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";
import RescheduleClient from "./RescheduleClient";

export const dynamic = "force-dynamic";

// Public, unauthenticated reschedule page reached via the secure,
// expiring, single-use-on-submit token embedded in every confirmation/
// reminder email - never a raw appointment id. "Rescheduling must notify
// the prospect" is handled by the action this page's client submits to
// (src/app/book-consultation/reschedule/actions.ts).
export default async function RescheduleAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lookup = await lookupWinsalotActionToken(token, "reschedule");

  if (!lookup.ok) {
    return <ErrorShell message={lookup.error} />;
  }

  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", lookup.appointmentId).maybeSingle();

  if (!appointment) return <ErrorShell message="This appointment could not be found." />;
  const appt = appointment as WinsalotAppointmentRow;
  if (appt.status === "cancelled") {
    return <ErrorShell message="This consultation has already been cancelled and can no longer be rescheduled." />;
  }

  const [settings, blackouts, { data: otherAppointments }] = await Promise.all([
    fetchWinsalotAvailabilitySettings(admin),
    fetchWinsalotBlackouts(admin),
    admin.from("winsalot_appointments").select("id, appointment_start_at, appointment_end_at").eq("status", "booked").neq("id", appt.id),
  ]);

  const existingRanges = (otherAppointments ?? []).map((a) => ({
    startMs: new Date(a.appointment_start_at as string).getTime(),
    endMs: new Date(a.appointment_end_at as string).getTime(),
  }));

  const slots = generateWinsalotBookingSlots(settings, blackouts, existingRanges);

  return (
    <RescheduleClient
      token={token}
      slotIsos={slots.map((s) => s.startUtcIso)}
      businessTimezone={settings.business_timezone}
      currentStartUtcIso={appt.appointment_start_at}
      contactName={appt.contact_name}
    />
  );
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
