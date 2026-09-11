"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyOfNewLeadgenAppointment } from "@/lib/leadgen-appointment-notifications";
import { isValidMobileNumber, sendImmediateAppointmentConfirmation } from "@/lib/appointment-sms";
import { zonedWallTimeToUtcMs } from "@/lib/leadgen-appointment-reminders";
import { LEADGEN_MEETING_TYPES, type LeadgenMeetingType } from "@/lib/leadgen-types";

type ActionResult = { error?: string; message?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

// Agent-scoped appointment booking (brief "Can book appointments").
// RLS (leadgen_appointments_agent_insert_own) requires the row to
// reference either this agent as assigned_specialist_id or a lead
// already assigned to them - both true by construction here, since the
// booking form always embeds the current agent's id and only ever
// appears on a lead they can already see.
export async function bookAppointmentAction(formData: FormData): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();

  const clientId = String(formData.get("client_id") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const appointmentDate = String(formData.get("appointment_date") ?? "").trim();
  const appointmentTime = String(formData.get("appointment_time") ?? "").trim();
  const meetingType = String(formData.get("meeting_type") ?? "").trim();

  if (!clientId) return { error: "Missing client." };
  if (!businessName) return { error: "Business name is required." };
  if (!appointmentDate || !appointmentTime) return { error: "Appointment date and time are required." };
  if (!LEADGEN_MEETING_TYPES.includes(meetingType as LeadgenMeetingType)) return { error: "Select a meeting type." };

  const leadId = textOrNull(formData, "lead_id");
  const contactName = textOrNull(formData, "contact_name");
  const phone = textOrNull(formData, "phone");
  const email = textOrNull(formData, "email");
  const timezone = String(formData.get("timezone") ?? "America/Toronto").trim();
  const meetingLink = textOrNull(formData, "meeting_link");
  const appointmentNotes = textOrNull(formData, "appointment_notes");

  const supabase = await createSupabaseServerClient();
  const { data: appointment, error } = await supabase
    .from("leadgen_appointments")
    .insert({
      lead_id: leadId,
      client_id: clientId,
      campaign_id: textOrNull(formData, "campaign_id"),
      business_name: businessName,
      contact_name: contactName,
      phone,
      email,
      // No separate consent checkbox - every appointment with a valid
      // mobile number is automatically eligible for SMS reminders, on
      // the notice shown beneath the phone field / Book Appointment button.
      sms_consent: isValidMobileNumber(phone),
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      timezone,
      meeting_type: meetingType,
      meeting_link: meetingLink,
      assigned_specialist_id: textOrNull(formData, "assigned_specialist_id") ?? agent.id,
      appointment_notes: appointmentNotes,
      created_by: agent.id,
    })
    .select("id")
    .single();

  if (error || !appointment) return { error: "Failed to book the appointment." };

  if (leadId) {
    await supabase
      .from("leadgen_leads")
      .update({ status: "Appointment booked", last_contacted_at: new Date().toISOString() })
      .eq("id", leadId);
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: leadId,
      agent_id: agent.id,
      activity_type: "appointment_booked",
      call_outcome: "Appointment booked",
      notes: `Appointment booked for ${appointmentDate} ${appointmentTime} by ${agent.full_name || agent.email}.`,
    });
  }

  const { data: clientForNotify } = await supabase
    .from("leadgen_clients")
    .select("id, name, contact_name, contact_email, appointment_notification_emails, sms_notification_number")
    .eq("id", clientId)
    .maybeSingle();
  await sendImmediateAppointmentConfirmation(getSupabaseAdmin(), {
    table: "leadgen_appointment_sms_reminders",
    appointmentId: appointment.id as string,
    leadId,
    scheduledAppointmentAtIso: new Date(zonedWallTimeToUtcMs(appointmentDate, appointmentTime, timezone)).toISOString(),
    timezone,
    prospectPhone: phone,
    prospectConsent: isValidMobileNumber(phone),
    businessName: clientForNotify?.name ?? "our team",
  });
  if (clientForNotify) {
    await notifyOfNewLeadgenAppointment(
      {
        id: appointment.id as string,
        lead_id: leadId,
        business_name: businessName,
        contact_name: contactName,
        phone,
        email,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        timezone,
        meeting_type: meetingType as LeadgenMeetingType,
        meeting_link: meetingLink,
        appointment_notes: appointmentNotes,
      },
      clientForNotify,
      agent.full_name || agent.email
    );
  }

  revalidatePath("/leadgen/agent/appointments");
  if (leadId) revalidatePath(`/leadgen/agent/leads/${leadId}`);
  return {};
}
