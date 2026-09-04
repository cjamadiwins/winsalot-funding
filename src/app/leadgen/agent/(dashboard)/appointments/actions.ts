"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { notifyOfNewLeadgenAppointment } from "@/lib/leadgen-appointment-notifications";
import { sendLeadgenAppointmentEmail } from "@/lib/leadgen-appointment-emails";
import { LEADGEN_MEETING_TYPES, type LeadgenMeetingType } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

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
      sms_consent: formData.get("sms_consent") === "on",
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
    .select("id, name, contact_name, contact_email, appointment_notification_emails")
    .eq("id", clientId)
    .maybeSingle();
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

// "Resend Appointment Notification" / "Send Appointment Reminder" (brief
// EMAIL FEATURES #4/#5) - agents may only use these for a lead assigned
// to them (or an appointment where they're the assigned specialist),
// enforced by the same RLS this session-scoped client already applies to
// every other agent action in this CRM (leadgen_appointments_agent_
// select_own / leadgen_emails_agent_insert_own_lead): an appointment that
// isn't theirs simply isn't visible here, so sendLeadgenAppointmentEmail
// fails closed with "Appointment not found." rather than leaking it.
export async function resendAppointmentNotificationAction(appointmentId: string): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const result = await sendLeadgenAppointmentEmail(supabase, appointmentId, agent, "resend_confirmation");
  if (result.error) return { error: result.error };

  revalidatePath("/leadgen/agent/appointments");
  if (result.leadId) revalidatePath(`/leadgen/agent/leads/${result.leadId}`);
  return {};
}

// Second parameter accepted only so this matches sendAppointmentReminderAction's
// admin-side signature for LeadDetailActions/AppointmentEmailActions -
// "Count this as the 24-hour reminder" is an admin-only affordance (the
// agent UI never renders that checkbox, so this is never actually true
// in practice), and is deliberately ignored here regardless.
export async function sendAppointmentReminderAction(appointmentId: string, _countAsAutomaticReminder?: boolean): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const result = await sendLeadgenAppointmentEmail(supabase, appointmentId, agent, "reminder");
  if (result.error) return { error: result.error };

  revalidatePath("/leadgen/agent/appointments");
  if (result.leadId) revalidatePath(`/leadgen/agent/leads/${result.leadId}`);
  return {};
}
