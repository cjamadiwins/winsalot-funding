"use server";

// Public, unauthenticated booking submission for /book/[slug]. No
// Supabase session exists here at all (same as the Calendly webhook and
// the cleaning CRM's customer-quote/provider-quote public token flows),
// so every query below goes through the service-role admin client -
// there is no leadgen RLS policy for an anonymous visitor to lean on.

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyOfNewLeadgenAppointment } from "@/lib/leadgen-appointment-notifications";
import { isLeadgenBookingSlotOffered, LEADGEN_BOOKING_TIMEZONE, normalizeLeadgenAppointmentTime, slugifyForLeadgenBookingPath } from "@/lib/leadgen-booking";
import { isValidEmail, LEADGEN_LEAD_CLOSED_STATUSES, type LeadgenAppointmentRow, type LeadgenClientRow, type LeadgenLeadStatus } from "@/lib/leadgen-types";

export type BookLeadgenAppointmentResult = { error?: string; appointmentId?: string };

async function findActiveClientBySlug(slug: string): Promise<Pick<LeadgenClientRow, "id" | "name" | "slug"> | null> {
  const admin = getSupabaseAdmin();
  const { data: clients } = await admin.from("leadgen_clients").select("id, name, slug").eq("active", true);
  return (clients ?? []).find((c) => slugifyForLeadgenBookingPath(c.name) === slug || c.slug.toLowerCase() === slug.toLowerCase()) ?? null;
}

export async function bookLeadgenAppointmentAction(slug: string, formData: FormData): Promise<BookLeadgenAppointmentResult> {
  const admin = getSupabaseAdmin();

  const client = await findActiveClientBySlug(slug);
  if (!client) return { error: "This booking page is not available." };

  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const contactName = String(formData.get("name") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!date || !time) return { error: "Choose a date and time." };
  if (!contactName) return { error: "Enter your name." };
  if (!businessName) return { error: "Enter your business name." };
  if (!email || !isValidEmail(email)) return { error: "Enter a valid email address." };
  if (!phone) return { error: "Enter a phone number." };

  // Re-validate the slot server-side against the same offered schedule
  // (never trust the client's selection) and against currently-booked
  // slots for this client, so a stale page (or a tampered request)
  // can't book outside real availability.
  const { data: existingForClient } = await admin
    .from("leadgen_appointments")
    .select("appointment_date, appointment_time")
    .eq("client_id", client.id)
    .neq("status", "Cancelled");
  const bookedSlots = new Set((existingForClient ?? []).map((a) => `${a.appointment_date}|${normalizeLeadgenAppointmentTime(a.appointment_time)}`));

  if (!isLeadgenBookingSlotOffered(date, time, bookedSlots)) {
    return { error: "That time is no longer available. Please choose another date or time." };
  }

  // Best-effort match back to an existing lead for this client by email,
  // same rule as the Calendly webhook (src/app/api/webhooks/calendly/
  // route.ts): the most recently created lead with a matching email
  // that isn't already closed out.
  let matchedLeadId: string | null = null;
  const { data: leadCandidates } = await admin
    .from("leadgen_leads")
    .select("id, status")
    .eq("client_id", client.id)
    .ilike("email", email)
    .order("created_at", { ascending: false });
  const matchedLead = (leadCandidates ?? []).find((lead) => !LEADGEN_LEAD_CLOSED_STATUSES.includes(lead.status as LeadgenLeadStatus));
  matchedLeadId = matchedLead?.id ?? null;

  const { data: appointment, error: insertError } = await admin
    .from("leadgen_appointments")
    .insert({
      lead_id: matchedLeadId,
      client_id: client.id,
      campaign_id: null,
      business_name: businessName,
      contact_name: contactName,
      phone,
      email,
      appointment_date: date,
      appointment_time: time,
      timezone: LEADGEN_BOOKING_TIMEZONE,
      meeting_type: "Phone Call",
      status: "Booked",
      created_by: null,
    })
    .select("*")
    .single();

  if (insertError || !appointment) {
    // Unique-violation on leadgen_appointments_unique_active_slot
    // (migration 0047) means someone else booked this exact slot in the
    // brief window between our availability check and this insert.
    if (insertError?.code === "23505") {
      return { error: "That time was just booked by someone else. Please choose another time." };
    }
    console.error("[leadgen-booking] Failed to save appointment:", insertError);
    return { error: "Failed to book the appointment. Please try again." };
  }

  if (matchedLeadId) {
    await admin
      .from("leadgen_leads")
      .update({ status: "Appointment booked", last_contacted_at: new Date().toISOString() })
      .eq("id", matchedLeadId);
    await admin.from("leadgen_lead_activities").insert({
      lead_id: matchedLeadId,
      agent_id: null,
      activity_type: "appointment_booked",
      call_outcome: "Appointment booked",
      notes: `Appointment self-booked via the built-in booking page for ${date} ${time} (${LEADGEN_BOOKING_TIMEZONE}).`,
    });
  }

  await notifyOfNewLeadgenAppointment(appointment as LeadgenAppointmentRow, client, null);
  await admin.from("leadgen_appointments").update({ admin_notified_at: new Date().toISOString() }).eq("id", appointment.id);

  revalidatePath("/leadgen/admin/appointments");
  if (matchedLeadId) revalidatePath(`/leadgen/admin/leads/${matchedLeadId}`);

  return { appointmentId: appointment.id as string };
}
