"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import {
  addWinsalotBlackout,
  removeWinsalotBlackout,
  updateWinsalotAvailabilitySettings,
  type UpdateWinsalotAvailabilityInput,
} from "@/lib/winsalot-consultation-availability";
import { updateWinsalotCompanySmsNotificationNumber } from "@/lib/winsalot-consultation-reminders";

export async function updateWinsalotAvailabilityAction(formData: FormData): Promise<{ error?: string }> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const weekdays = formData
    .getAll("available_weekdays")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  const input: UpdateWinsalotAvailabilityInput = {
    available_weekdays: weekdays,
    business_start_time: String(formData.get("business_start_time") ?? ""),
    business_end_time: String(formData.get("business_end_time") ?? ""),
    business_timezone: String(formData.get("business_timezone") ?? "America/Toronto").trim() || "America/Toronto",
    min_notice_minutes: Number(formData.get("min_notice_minutes") ?? 0),
    max_advance_days: Number(formData.get("max_advance_days") ?? 0),
    buffer_minutes: Number(formData.get("buffer_minutes") ?? 0),
  };

  const result = await updateWinsalotAvailabilitySettings(supabase, input, crmUser.full_name || crmUser.email);
  revalidatePath("/admin/crm/consultation-availability");
  return result;
}

export async function addWinsalotBlackoutAction(formData: FormData): Promise<{ error?: string }> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const startAtRaw = String(formData.get("start_at") ?? "");
  const endAtRaw = String(formData.get("end_at") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const startAt = new Date(startAtRaw);
  const endAt = new Date(endAtRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { error: "Enter a valid start and end date/time." };
  }

  const result = await addWinsalotBlackout(supabase, {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    reason,
    createdBy: crmUser.id,
  });
  revalidatePath("/admin/crm/consultation-availability");
  return result;
}

export async function removeWinsalotBlackoutAction(id: string): Promise<{ error?: string }> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const result = await removeWinsalotBlackout(supabase, id);
  revalidatePath("/admin/crm/consultation-availability");
  return result;
}

export async function updateWinsalotCompanySmsNumberAction(formData: FormData): Promise<{ error?: string }> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const raw = String(formData.get("company_sms_notification_number") ?? "").trim();
  const result = await updateWinsalotCompanySmsNotificationNumber(supabase, raw || null, crmUser.full_name || crmUser.email);
  revalidatePath("/admin/crm/consultation-availability");
  return result;
}
