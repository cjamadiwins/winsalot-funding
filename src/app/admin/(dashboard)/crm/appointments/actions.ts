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
import type { WinsalotAppointmentIncentiveStatus } from "@/lib/winsalot-consultation-types";

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

// Quick incentive review directly from the Admin Appointments table's
// Incentive column ("Verify as Qualified" / "Reject" buttons) - a lean
// alternative to picking a value in the "Manage" panel's full Incentive
// Status dropdown (which stays available for the finer-grained Cancelled/
// Invalid/Duplicate categories). Mirrors
// reviewLeadgenAppointmentIncentiveAction (leadgen/admin/appointments/
// actions.ts) exactly. Touches only the incentive_status* columns and
// updated_at - never re-parents the appointment or changes any other
// field, so it can never duplicate the appointment count or its
// assigned_agent_id credit. Crediting to the assigned agent and
// bucketing into their current Monday-Sunday week both fall out of
// existing, unchanged logic (assigned_agent_id set at booking time;
// crm-incentives.ts buckets by created_at) - this action only ever
// writes the review decision itself.
export async function reviewCrmAppointmentIncentiveAction(
  appointmentId: string,
  decision: Extract<WinsalotAppointmentIncentiveStatus, "Qualified" | "Unqualified">,
  reason: string | null
): Promise<{ error?: string }> {
  const adminUser = await requireCrmAdmin();

  if (decision !== "Qualified" && !reason?.trim()) {
    return { error: "A reason is required to reject an appointment." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("winsalot_appointments")
    .select("incentive_status, opportunity_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!existing) return { error: "Appointment not found." };

  const { error } = await supabase
    .from("winsalot_appointments")
    .update({
      incentive_status: decision,
      incentive_status_reason: decision === "Qualified" ? null : reason!.trim(),
      incentive_status_set_by: adminUser.id,
      incentive_status_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (error) return { error: "Failed to save the incentive review." };

  if (existing.opportunity_id) {
    await supabase.from("crm_activities").insert({
      opportunity_id: existing.opportunity_id,
      agent_id: null,
      activity_type: "note",
      notes:
        decision === "Qualified"
          ? `Consultation appointment verified as Qualified for the Weekly Incentive by ${adminUser.full_name || adminUser.email}.`
          : `Consultation appointment rejected for the Weekly Incentive by ${adminUser.full_name || adminUser.email}. Reason: ${reason!.trim()}`,
    });
  }

  revalidatePath("/admin/crm/appointments");
  revalidatePath("/admin/crm/incentives");
  revalidatePath("/agent/dashboard");
  revalidatePath("/agent/appointments");
  if (existing.opportunity_id) revalidatePath(`/admin/crm/opportunities/${existing.opportunity_id}`);
  return {};
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
