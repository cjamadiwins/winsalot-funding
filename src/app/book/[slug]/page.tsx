import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateLeadgenBookingDays, slugifyForLeadgenBookingPath } from "@/lib/leadgen-booking";
import BookingPageClient from "./BookingPageClient";

export const dynamic = "force-dynamic";

// Public, unauthenticated built-in consultation booking page - no
// Supabase session, no CRM chrome. Reachable at /book/<slug>, where
// <slug> is the client's name slugified (see slugifyForLeadgenBookingPath
// above) - e.g. "Brent's Essentials" -> "brents-essentials".
// This is the page leadgen_clients.booking_link points customers at; the
// blue "Book Your Free 15-Minute Appointment" button already used by
// every consultation/follow-up email just opens whatever URL is saved
// there (see lib/leadgen-types.ts resolveLeadgenEmailBranding /
// src/app/leadgen/*/leads/[id]/actions.ts) - no email code needed to
// change for this page to start working, only the saved link itself.
export default async function LeadgenBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = getSupabaseAdmin();

  const { data: clients } = await admin.from("leadgen_clients").select("id, name").eq("active", true);
  const client = (clients ?? []).find((c) => slugifyForLeadgenBookingPath(c.name) === slug);
  if (!client) notFound();

  const { data: existing } = await admin
    .from("leadgen_appointments")
    .select("appointment_date, appointment_time")
    .eq("client_id", client.id)
    .neq("status", "Cancelled");
  const bookedSlots = new Set((existing ?? []).map((a) => `${a.appointment_date}|${a.appointment_time}`));

  const days = generateLeadgenBookingDays(bookedSlots);

  return <BookingPageClient slug={slug} clientName={client.name} days={days} />;
}
