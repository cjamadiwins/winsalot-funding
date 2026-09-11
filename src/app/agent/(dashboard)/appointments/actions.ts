"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import {
  getWinsalotOfferedSlots,
  performWinsalotAppointmentEdit,
  performWinsalotCancellation,
  performWinsalotReschedule,
  type WinsalotAppointmentEditInput,
} from "@/lib/winsalot-consultation-book";
import { describeManualSmsOutcome } from "@/lib/appointment-sms";
import { sendManualWinsalotAppointmentEmail, sendManualWinsalotAppointmentSms } from "@/lib/winsalot-consultation-reminders";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";

type ActionResult = { error?: string; message?: string };

// Every action below first re-confirms ownership through the *session*
// client (RLS-scoped by winsalot_appointments_agent_select_own to
// assigned_agent_id = auth.uid()) before calling the shared core
// function, which itself writes through the service-role client and so
// does not enforce RLS on its own - this check is what actually stops an
// agent from touching another agent's appointment by id.
async function assertOwnAppointment(appointmentId: string, agentId: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("winsalot_appointments").select("id").eq("id", appointmentId).eq("assigned_agent_id", agentId).maybeSingle();
  if (!data) return { error: "Appointment not found." };
  return {};
}

export async function getOfferedSlotsAction(excludeAppointmentId: string) {
  const crmUser = await requireCrmUser();
  const ownership = await assertOwnAppointment(excludeAppointmentId, crmUser.id);
  if (ownership.error) return { slotIsos: [], businessTimezone: "America/Toronto" };
  return getWinsalotOfferedSlots(excludeAppointmentId);
}

export async function rescheduleAppointmentAction(appointmentId: string, startUtcIso: string) {
  const crmUser = await requireCrmUser();
  const ownership = await assertOwnAppointment(appointmentId, crmUser.id);
  if (ownership.error) return ownership;

  const result = await performWinsalotReschedule(appointmentId, startUtcIso, null, { role: "agent", userId: crmUser.id });
  revalidatePath("/agent/appointments");
  revalidatePath("/admin/crm/appointments");
  return result;
}

export async function cancelAppointmentAction(appointmentId: string, reason: string | null) {
  const crmUser = await requireCrmUser();
  const ownership = await assertOwnAppointment(appointmentId, crmUser.id);
  if (ownership.error) return ownership;

  const result = await performWinsalotCancellation(appointmentId, reason, { role: "agent", userId: crmUser.id });
  revalidatePath("/agent/appointments");
  revalidatePath("/admin/crm/appointments");
  return result;
}

export async function editAppointmentAction(appointmentId: string, input: WinsalotAppointmentEditInput) {
  const crmUser = await requireCrmUser();
  const ownership = await assertOwnAppointment(appointmentId, crmUser.id);
  if (ownership.error) return ownership;

  const result = await performWinsalotAppointmentEdit(appointmentId, input);
  revalidatePath("/agent/appointments");
  revalidatePath("/admin/crm/appointments");
  return result;
}

// Shared by resendAppointmentNotificationAction/sendAppointmentReminderAction
// below - the SMS half of both buttons.
async function sendManualSmsForAction(appointmentId: string, kind: "resend_confirmation" | "reminder"): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!appointment) return null;

  const result = await sendManualWinsalotAppointmentSms(admin, appointment as WinsalotAppointmentRow, kind);
  return describeManualSmsOutcome(result);
}

// "Resend Appointment Notification" / "Send Appointment Reminder" - the
// same two manual actions the admin Appointments page has
// (admin/crm/appointments/actions.ts). An agent may only use these for
// an appointment assigned to them, enforced by assertOwnAppointment above
// exactly like every other agent action in this file.
export async function resendAppointmentNotificationAction(appointmentId: string): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const ownership = await assertOwnAppointment(appointmentId, crmUser.id);
  if (ownership.error) return ownership;

  const admin = getSupabaseAdmin();
  const result = await sendManualWinsalotAppointmentEmail(admin, appointmentId, "resend_confirmation", crmUser.full_name || crmUser.email);
  if (result.error) return { error: result.error };

  const smsMessage = await sendManualSmsForAction(appointmentId, "resend_confirmation");

  revalidatePath("/agent/appointments");
  revalidatePath("/admin/crm/appointments");
  return { message: smsMessage ?? undefined };
}

export async function sendAppointmentReminderAction(appointmentId: string): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const ownership = await assertOwnAppointment(appointmentId, crmUser.id);
  if (ownership.error) return ownership;

  const admin = getSupabaseAdmin();
  const result = await sendManualWinsalotAppointmentEmail(admin, appointmentId, "reminder", crmUser.full_name || crmUser.email);
  if (result.error) return { error: result.error };

  const smsMessage = await sendManualSmsForAction(appointmentId, "reminder");

  revalidatePath("/agent/appointments");
  revalidatePath("/admin/crm/appointments");
  return { message: smsMessage ?? undefined };
}
