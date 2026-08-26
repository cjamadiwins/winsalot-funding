import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchWinsalotAvailabilitySettings, fetchWinsalotBlackouts } from "@/lib/winsalot-consultation-availability";
import { generateWinsalotBookingSlots } from "@/lib/winsalot-consultation-booking";
import { resolveWinsalotPrefillToken } from "@/lib/winsalot-consultation-tokens";
import BookingPageClient, { type WinsalotPrefill } from "./BookingPageClient";

export const dynamic = "force-dynamic";

// Public, unauthenticated Winsalot Growth CRM consultation-booking page -
// https://growth.winsalotcorp.com/book-consultation. Entirely separate
// from the Lead Gen CRM's built-in /book/[slug] page: its own tables
// (winsalot_appointments, winsalot_appointment_availability_settings,
// winsalot_appointment_blackouts), its own branding, and its own slot
// generator (src/lib/winsalot-consultation-booking.ts) driven by the
// admin-configurable settings at /admin/crm/consultation-availability
// rather than a fixed constant schedule.
//
// A visit from a prospect consultation-invite email carries a secure,
// single-purpose prefill token (?t=<token>, minted per send - see
// src/lib/send-prospect-email.ts) rather than a raw crm_opportunities id.
// The token only ever resolves to that one prospect's own prefillable
// fields, via the service-role client - never anything else about that
// record, and never any other prospect's data.
export default async function BookConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const admin = getSupabaseAdmin();

  const [settings, blackouts, { data: existingAppointments }] = await Promise.all([
    fetchWinsalotAvailabilitySettings(admin),
    fetchWinsalotBlackouts(admin),
    admin.from("winsalot_appointments").select("appointment_start_at, appointment_end_at").eq("status", "booked"),
  ]);

  const existingRanges = (existingAppointments ?? []).map((a) => ({
    startMs: new Date(a.appointment_start_at as string).getTime(),
    endMs: new Date(a.appointment_end_at as string).getTime(),
  }));

  const slots = generateWinsalotBookingSlots(settings, blackouts, existingRanges);
  const slotIsos = slots.map((s) => s.startUtcIso);

  let prefill: WinsalotPrefill | null = null;
  if (t) {
    const lookup = await resolveWinsalotPrefillToken(t);
    if (lookup.ok) {
      const { data: opportunity } = await admin
        .from("crm_opportunities")
        .select("contact_name, business_name, email, phone, opportunity_type")
        .eq("id", lookup.opportunityId)
        .maybeSingle();
      if (opportunity) {
        prefill = {
          contactName: opportunity.contact_name ?? "",
          businessName: opportunity.business_name ?? "",
          email: opportunity.email ?? "",
          phone: opportunity.phone ?? "",
          serviceType: opportunity.opportunity_type,
        };
      }
    }
  }

  return (
    <BookingPageClient
      slotIsos={slotIsos}
      businessTimezone={settings.business_timezone}
      prefillToken={t ?? null}
      prefill={prefill}
    />
  );
}
