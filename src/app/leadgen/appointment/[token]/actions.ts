"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashLeadgenAppointmentToken } from "@/lib/leadgen-appointment-notifications";
import { generateAvailableSlots } from "@/lib/leadgen-scheduling";
import { sendLeadgenEmail } from "@/lib/leadgen-email";
import type { LeadgenAppointmentRow, LeadgenClientRow } from "@/lib/leadgen-types";

type ActionResult = { ok: true } | { ok: false; error: string };

function isTokenActive(token: { revoked_at: string | null; expires_at: string }): boolean {
  return !token.revoked_at && new Date(token.expires_at).getTime() > Date.now();
}

async function loadTokenAndAppointment(token: string) {
  const admin = getSupabaseAdmin();
  const tokenHash = hashLeadgenAppointmentToken(token);

  const { data: tokenRow } = await admin
    .from("leadgen_appointment_tokens")
    .select("id, appointment_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !isTokenActive(tokenRow)) return null;

  const { data: appointment } = await admin.from("leadgen_appointments").select("*").eq("id", tokenRow.appointment_id).maybeSingle();
  if (!appointment) return null;

  return { admin, appointment: appointment as LeadgenAppointmentRow };
}

export async function rescheduleLeadgenAppointmentAction(token: string, newDate: string, newTime: string): Promise<ActionResult> {
  const loaded = await loadTokenAndAppointment(token);
  if (!loaded) return { ok: false, error: "This link is no longer available." };
  const { admin, appointment } = loaded;

  if (appointment.status === "Cancelled") return { ok: false, error: "This appointment has been cancelled and can't be rescheduled here." };

  const possibleSlots = generateAvailableSlots([]);
  if (!possibleSlots.some((s) => s.date === newDate && s.time === newTime)) {
    return { ok: false, error: "That time isn't available. Please choose another." };
  }

  const { data: conflicting } = await admin
    .from("leadgen_appointments")
    .select("id")
    .eq("client_id", appointment.client_id)
    .eq("appointment_date", newDate)
    .eq("appointment_time", newTime)
    .neq("status", "Cancelled")
    .neq("id", appointment.id)
    .maybeSingle();

  if (conflicting) return { ok: false, error: "That time was just booked by someone else. Please choose another." };

  const { error } = await admin
    .from("leadgen_appointments")
    .update({ appointment_date: newDate, appointment_time: newTime, status: "Rescheduled", updated_at: new Date().toISOString() })
    .eq("id", appointment.id);

  if (error) return { ok: false, error: "Something went wrong. Please try again." };

  const { data: client } = await admin.from("leadgen_clients").select("id, name").eq("id", appointment.client_id).maybeSingle();

  if (appointment.email && client) {
    await sendLeadgenEmail(admin, {
      clientId: appointment.client_id,
      leadId: appointment.lead_id,
      appointmentId: appointment.id,
      templateKey: null,
      toEmail: appointment.email,
      toName: appointment.contact_name,
      subject: `Your Consultation Has Been Rescheduled - ${(client as LeadgenClientRow).name}`,
      body: [
        `Hi ${(appointment.contact_name || appointment.business_name).split(" ")[0]},`,
        "",
        `Your consultation with ${(client as LeadgenClientRow).name} has been moved to:`,
        "",
        `${newDate} at ${newTime} (${appointment.timezone})`,
        "",
        "Best regards,",
        "",
        "Winsalot Corp",
        `on behalf of ${(client as LeadgenClientRow).name}`,
      ].join("\n"),
      sentBy: null,
      clientVisible: false,
    });
  }

  return { ok: true };
}

export async function cancelLeadgenAppointmentAction(token: string): Promise<ActionResult> {
  const loaded = await loadTokenAndAppointment(token);
  if (!loaded) return { ok: false, error: "This link is no longer available." };
  const { admin, appointment } = loaded;

  if (appointment.status === "Cancelled") return { ok: true };

  const { error } = await admin
    .from("leadgen_appointments")
    .update({ status: "Cancelled", updated_at: new Date().toISOString() })
    .eq("id", appointment.id);

  if (error) return { ok: false, error: "Something went wrong. Please try again." };

  const { data: client } = await admin.from("leadgen_clients").select("id, name").eq("id", appointment.client_id).maybeSingle();

  if (appointment.email && client) {
    await sendLeadgenEmail(admin, {
      clientId: appointment.client_id,
      leadId: appointment.lead_id,
      appointmentId: appointment.id,
      templateKey: null,
      toEmail: appointment.email,
      toName: appointment.contact_name,
      subject: `Your Consultation Has Been Cancelled - ${(client as LeadgenClientRow).name}`,
      body: [
        `Hi ${(appointment.contact_name || appointment.business_name).split(" ")[0]},`,
        "",
        `Your consultation with ${(client as LeadgenClientRow).name} scheduled for ${appointment.appointment_date} at ${appointment.appointment_time} (${appointment.timezone}) has been cancelled.`,
        "",
        "If you'd like to book a new time, just reply to this email.",
        "",
        "Best regards,",
        "",
        "Winsalot Corp",
        `on behalf of ${(client as LeadgenClientRow).name}`,
      ].join("\n"),
      sentBy: null,
      clientVisible: false,
    });
  }

  return { ok: true };
}
