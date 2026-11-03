import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadAppointmentQualityData } from "@/lib/leadgen-appointment-quality-data";
import AppointmentQualityClient from "./AppointmentQualityClient";

export const dynamic = "force-dynamic";

export default async function LeadgenAdminAppointmentQualityPage({ searchParams }: { searchParams: Promise<{ highlight?: string }> }) {
  await requireLeadgenAdmin();
  const { highlight } = await searchParams;
  const data = await loadAppointmentQualityData(getSupabaseAdmin());
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-xl font-bold text-slate-900">Appointment Quality Control</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Review each agent&apos;s qualification before an appointment is shared with the client. Approving releases the usual notifications, reminders and appointment brief.
      </p>
      <AppointmentQualityClient data={data} highlight={highlight ?? null} />
    </div>
  );
}
