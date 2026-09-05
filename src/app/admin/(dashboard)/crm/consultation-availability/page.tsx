import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchWinsalotAvailabilitySettings, fetchWinsalotBlackouts } from "@/lib/winsalot-consultation-availability";
import { fetchWinsalotAppointmentReminderSettings } from "@/lib/winsalot-consultation-reminders";
import ConsultationAvailabilityClient from "./ConsultationAvailabilityClient";

// Admin-only settings page for the Winsalot consultation-booking system's
// availability - weekdays, business hours, timezone (Eastern Time by
// default), blocked dates/periods, minimum advance notice, maximum
// future booking range, and buffer time between appointments. Every
// value here is read by src/lib/winsalot-consultation-booking.ts's slot
// generator, shared by both the public booking page and the agent/admin
// "Book Consultation" action - so a change here takes effect for both
// booking methods immediately.
export default async function ConsultationAvailabilityPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [settings, blackouts, reminderSettings] = await Promise.all([
    fetchWinsalotAvailabilitySettings(supabase),
    fetchWinsalotBlackouts(supabase),
    fetchWinsalotAppointmentReminderSettings(supabase),
  ]);

  return <ConsultationAvailabilityClient settings={settings} blackouts={blackouts} reminderSettings={reminderSettings} />;
}
