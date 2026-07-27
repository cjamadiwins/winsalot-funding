"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidEmail, type LeadgenAppointmentRow, type LeadgenClientRow } from "@/lib/leadgen-types";
import { generateAvailableSlots, LEADGEN_BOOKING_TIMEZONE } from "@/lib/leadgen-scheduling";
import { createLeadgenAppointmentManageLink, notifyAdminOfNewLeadgenAppointment, sendLeadgenBookingConfirmation } from "@/lib/leadgen-appointment-notifications";

export type BookConsultationResult =
  | { ok: true; appointmentDate: string; appointmentTime: string; timezone: string }
  | { ok: false; error: string };

// Public server action behind the consultation booking page - no
// Supabase Auth session, so every read/write here uses the service-role
// client (getSupabaseAdmin()), exactly like the cleaning CRM's
// /customer-quote and /provider-quote token actions.
export async function submitConsultationBookingAction(slug: string, formData: FormData): Promise<BookConsultationResult> {
  const admin = getSupabaseAdmin();

  const { data: client } = await admin.from("leadgen_clients").select("*").eq("slug", slug).maybeSingle();
  if (!client || !(client as LeadgenClientRow).active) {
    return { ok: false, error: "This booking page isn't available." };
  }

  const contactName = String(formData.get("contact_name") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const appointmentDate = String(formData.get("appointment_date") ?? "").trim();
  const appointmentTime = String(formData.get("appointment_time") ?? "").trim();

  if (!contactName) return { ok: false, error: "Enter your name." };
  if (!businessName) return { ok: false, error: "Enter your business name." };
  if (!email || !isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (!phone) return { ok: false, error: "Enter a phone number." };
  if (!appointmentDate || !appointmentTime) return { ok: false, error: "Select a date and time." };

  // Re-validate server-side that the submitted slot is a real,
  // currently-open slot - never trust the client's selection alone
  // (prevents both an honest race condition, where two prospects submit
  // the same slot seconds apart, and a tampered request for a slot that
  // was never offered at all, e.g. outside business hours).
  const { data: existingForClient } = await admin
    .from("leadgen_appointments")
    .select("appointment_date, appointment_time, status")
    .eq("client_id", client.id)
    .eq("appointment_date", appointmentDate);

  const possibleSlots = generateAvailableSlots([]);
  const isTheoreticallyValid = possibleSlots.some((s) => s.date === appointmentDate && s.time === appointmentTime);
  if (!isTheoreticallyValid) {
    return { ok: false, error: "That time isn't available. Please choose another." };
  }

  const alreadyTaken = (existingForClient ?? []).some(
    (a) => a.status !== "Cancelled" && a.appointment_time === appointmentTime
  );

  // Dedup guard: a double form submission (slow network retry, double
  // click that slipped past the disabled-button guard) for the exact
  // same prospect/slot within the last 5 minutes is treated as the same
  // booking rather than creating a second appointment and sending a
  // second round of notifications.
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentDuplicate } = await admin
    .from("leadgen_appointments")
    .select("id, appointment_date, appointment_time, timezone")
    .eq("client_id", client.id)
    .eq("email", email)
    .eq("appointment_date", appointmentDate)
    .eq("appointment_time", appointmentTime)
    .neq("status", "Cancelled")
    .gte("created_at", fiveMinutesAgo)
    .maybeSingle();

  if (recentDuplicate) {
    return { ok: true, appointmentDate: recentDuplicate.appointment_date, appointmentTime: recentDuplicate.appointment_time, timezone: recentDuplicate.timezone };
  }

  if (alreadyTaken) {
    return { ok: false, error: "That time was just booked by someone else. Please choose another." };
  }

  const { data: appointment, error } = await admin
    .from("leadgen_appointments")
    .insert({
      lead_id: null,
      client_id: client.id,
      campaign_id: null,
      business_name: businessName,
      contact_name: contactName,
      phone,
      email,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      timezone: LEADGEN_BOOKING_TIMEZONE,
      meeting_type: "Phone Call",
      status: "Booked",
      created_by: null,
    })
    .select("*")
    .single();

  if (error || !appointment) {
    return { ok: false, error: "Something went wrong saving your booking. Please try again." };
  }

  const appt = appointment as LeadgenAppointmentRow;

  // Notifications only fire after the row above is confirmed saved -
  // never before, and never more than once per appointment (the dedup
  // guard above is what prevents a second insert/second notification
  // round, not a flag on this fresh row).
  const manageUrl = await createLeadgenAppointmentManageLink(admin, appt.id);

  await Promise.allSettled([
    sendLeadgenBookingConfirmation(admin, appt, client as LeadgenClientRow, manageUrl),
    notifyAdminOfNewLeadgenAppointment(admin, appt, client as LeadgenClientRow, null),
  ]);

  await admin.from("leadgen_appointments").update({ admin_notified_at: new Date().toISOString() }).eq("id", appt.id);

  return { ok: true, appointmentDate: appt.appointment_date, appointmentTime: appt.appointment_time, timezone: appt.timezone };
}
