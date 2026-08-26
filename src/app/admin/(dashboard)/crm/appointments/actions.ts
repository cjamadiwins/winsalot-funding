"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import {
  getWinsalotOfferedSlots,
  performWinsalotAppointmentEdit,
  performWinsalotCancellation,
  performWinsalotReschedule,
  type WinsalotAppointmentEditInput,
} from "@/lib/winsalot-consultation-book";

export async function getOfferedSlotsAction(excludeAppointmentId: string) {
  await requireCrmAdmin();
  return getWinsalotOfferedSlots(excludeAppointmentId);
}

export async function rescheduleAppointmentAction(appointmentId: string, startUtcIso: string) {
  const crmUser = await requireCrmAdmin();
  const result = await performWinsalotReschedule(appointmentId, startUtcIso, null, { role: "admin", userId: crmUser.id });
  revalidatePath("/admin/crm/appointments");
  revalidatePath("/agent/appointments");
  return result;
}

export async function cancelAppointmentAction(appointmentId: string, reason: string | null) {
  const crmUser = await requireCrmAdmin();
  const result = await performWinsalotCancellation(appointmentId, reason, { role: "admin", userId: crmUser.id });
  revalidatePath("/admin/crm/appointments");
  revalidatePath("/agent/appointments");
  return result;
}

export async function editAppointmentAction(appointmentId: string, input: WinsalotAppointmentEditInput) {
  await requireCrmAdmin();
  const result = await performWinsalotAppointmentEdit(appointmentId, input);
  revalidatePath("/admin/crm/appointments");
  revalidatePath("/agent/appointments");
  return result;
}

// Admin-only permanent delete - unlike cancellation (which every role
// can do and keeps the record for reporting), this removes the row
// entirely. Kept a plain hard delete rather than a soft-delete/audit-log
// pattern since, unlike crm_leave_requests, an appointment's history is
// already fully preserved in the opportunity's own Activity Timeline
// (consultation_booked/rescheduled/cancelled entries survive the
// appointment row's deletion via crm_activities.opportunity_id, not a
// reference to the appointment itself).
export async function deleteAppointmentAction(appointmentId: string) {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("winsalot_appointments").delete().eq("id", appointmentId);
  revalidatePath("/admin/crm/appointments");
  revalidatePath("/agent/appointments");
  if (error) return { error: "Failed to delete the appointment." };
  return {};
}
