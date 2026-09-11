"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import {
  getWinsalotOfferedSlots,
  performWinsalotAppointmentEdit,
  performWinsalotCancellation,
  performWinsalotReschedule,
  type WinsalotAppointmentEditInput,
} from "@/lib/winsalot-consultation-book";

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
