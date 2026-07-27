"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendLeadgenEmail } from "@/lib/leadgen-email";
import { LEADGEN_APPOINTMENT_STATUSES, LEADGEN_MEETING_TYPES, type LeadgenAppointmentStatus, type LeadgenMeetingType } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function buildNewAppointmentEmailBody(input: {
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  appointmentDate: string;
  appointmentTime: string;
  timezone: string;
  meetingType: string;
  meetingLink: string | null;
  agentNotes: string | null;
}): string {
  const lines = [
    "A new appointment has been booked.",
    "",
    `Business Name: ${input.businessName}`,
    `Contact Name: ${input.contactName ?? "—"}`,
    `Phone Number: ${input.phone ?? "—"}`,
    `Email: ${input.email ?? "—"}`,
    `Appointment Date: ${input.appointmentDate}`,
    `Appointment Time: ${input.appointmentTime}`,
    `Time Zone: ${input.timezone}`,
    `Meeting Type: ${input.meetingType}`,
  ];
  if (input.meetingLink) lines.push(`Meeting Link: ${input.meetingLink}`);
  if (input.agentNotes) lines.push("", `Notes: ${input.agentNotes}`);
  lines.push("", "Regards,", "", "Winsalot Corp.");
  return lines.join("\n");
}

// Books an appointment (brief "APPOINTMENT FIELDS"). If tied to a lead,
// advances that lead's status to "Appointment booked" and logs it to the
// activity timeline. Optionally emails the client contact immediately
// (brief EMAIL FEATURES #1: "Send a client notification when a new
// appointment is booked") using the "agent notes approved for client
// viewing" field, never the lead's full internal notes.
export async function bookAppointmentAction(formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  const clientId = String(formData.get("client_id") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const appointmentDate = String(formData.get("appointment_date") ?? "").trim();
  const appointmentTime = String(formData.get("appointment_time") ?? "").trim();
  const meetingType = String(formData.get("meeting_type") ?? "").trim();

  if (!clientId) return { error: "Select a client." };
  if (!businessName) return { error: "Business name is required." };
  if (!appointmentDate || !appointmentTime) return { error: "Appointment date and time are required." };
  if (!LEADGEN_MEETING_TYPES.includes(meetingType as LeadgenMeetingType)) return { error: "Select a meeting type." };

  const leadId = textOrNull(formData, "lead_id");
  const contactName = textOrNull(formData, "contact_name");
  const phone = textOrNull(formData, "phone");
  const email = textOrNull(formData, "email");
  const timezone = String(formData.get("timezone") ?? "America/Toronto").trim();
  const meetingLink = textOrNull(formData, "meeting_link");
  const agentNotes = textOrNull(formData, "appointment_notes");
  const clientVisibleNotes = textOrNull(formData, "client_visible_notes");

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
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      timezone,
      meeting_type: meetingType,
      meeting_link: meetingLink,
      assigned_specialist_id: textOrNull(formData, "assigned_specialist_id"),
      appointment_notes: agentNotes,
      created_by: adminUser.id,
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
      agent_id: null,
      activity_type: "appointment_booked",
      call_outcome: "Appointment booked",
      notes: `Appointment booked for ${appointmentDate} ${appointmentTime} (${timezone}) by ${adminUser.full_name || adminUser.email}.`,
    });
  }

  if (formData.get("notify_client") === "true") {
    const { data: client } = await supabase.from("leadgen_clients").select("contact_email").eq("id", clientId).maybeSingle();
    if (client?.contact_email) {
      await sendLeadgenEmail(supabase, {
        clientId,
        campaignId: textOrNull(formData, "campaign_id"),
        leadId,
        appointmentId: appointment.id as string,
        templateKey: null,
        toEmail: client.contact_email,
        subject: `New Appointment Booked: ${businessName}`,
        body: buildNewAppointmentEmailBody({
          businessName,
          contactName,
          phone,
          email,
          appointmentDate,
          appointmentTime,
          timezone,
          meetingType,
          meetingLink,
          agentNotes: clientVisibleNotes,
        }),
        sentBy: adminUser.id,
        clientVisible: true,
      });
    }
  }

  revalidatePath("/leadgen/admin/appointments");
  if (leadId) revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return {};
}

export async function updateAppointmentAction(appointmentId: string, formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const status = String(formData.get("status") ?? "").trim();
  if (!LEADGEN_APPOINTMENT_STATUSES.includes(status as LeadgenAppointmentStatus)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const { data: appointment, error } = await supabase
    .from("leadgen_appointments")
    .update({
      status,
      appointment_date: String(formData.get("appointment_date") ?? "").trim() || undefined,
      appointment_time: String(formData.get("appointment_time") ?? "").trim() || undefined,
      meeting_link: textOrNull(formData, "meeting_link"),
      appointment_notes: textOrNull(formData, "appointment_notes"),
      client_feedback: textOrNull(formData, "client_feedback"),
      confirmation_sent: formData.get("confirmation_sent") === "true",
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
    .select("lead_id")
    .single();

  if (error) return { error: "Failed to update the appointment." };

  if (appointment?.lead_id) {
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: appointment.lead_id,
      agent_id: null,
      activity_type: "appointment_updated",
      notes: `Appointment status changed to "${status}".`,
    });
  }

  revalidatePath("/leadgen/admin/appointments");
  if (appointment?.lead_id) revalidatePath(`/leadgen/admin/leads/${appointment.lead_id}`);
  return {};
}
