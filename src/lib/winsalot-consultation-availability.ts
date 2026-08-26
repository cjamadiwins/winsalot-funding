import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WinsalotAvailabilitySettingsRow, WinsalotBlackoutRow } from "./winsalot-consultation-types";

const SETTINGS_TABLE = "winsalot_appointment_availability_settings";
const SETTINGS_ID = "00000000-0000-0000-0000-000000000201";
const BLACKOUTS_TABLE = "winsalot_appointment_blackouts";

const DEFAULT_SETTINGS: WinsalotAvailabilitySettingsRow = {
  id: SETTINGS_ID,
  available_weekdays: [1, 2, 3, 4, 5],
  business_start_time: "09:00:00",
  business_end_time: "17:00:00",
  business_timezone: "America/Toronto",
  min_notice_minutes: 120,
  max_advance_days: 30,
  buffer_minutes: 0,
  updated_at: new Date(0).toISOString(),
  updated_by_name: null,
};

export async function fetchWinsalotAvailabilitySettings(
  supabase: SupabaseClient
): Promise<WinsalotAvailabilitySettingsRow> {
  const { data } = await supabase.from(SETTINGS_TABLE).select("*").maybeSingle();
  return (data as WinsalotAvailabilitySettingsRow | null) ?? DEFAULT_SETTINGS;
}

export type UpdateWinsalotAvailabilityInput = {
  available_weekdays: number[];
  business_start_time: string;
  business_end_time: string;
  business_timezone: string;
  min_notice_minutes: number;
  max_advance_days: number;
  buffer_minutes: number;
};

export async function updateWinsalotAvailabilitySettings(
  supabase: SupabaseClient,
  input: UpdateWinsalotAvailabilityInput,
  updatedByName: string
): Promise<{ error?: string }> {
  if (input.available_weekdays.some((d) => d < 0 || d > 6)) {
    return { error: "Weekdays must be between 0 (Sunday) and 6 (Saturday)." };
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(input.business_start_time) || !/^\d{2}:\d{2}(:\d{2})?$/.test(input.business_end_time)) {
    return { error: "Invalid start/end time." };
  }
  if (input.business_start_time >= input.business_end_time) {
    return { error: "Start time must be before end time." };
  }
  if (input.min_notice_minutes < 0 || input.max_advance_days <= 0 || input.buffer_minutes < 0) {
    return { error: "Invalid scheduling values." };
  }

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({
      available_weekdays: input.available_weekdays,
      business_start_time: input.business_start_time,
      business_end_time: input.business_end_time,
      business_timezone: input.business_timezone,
      min_notice_minutes: input.min_notice_minutes,
      max_advance_days: input.max_advance_days,
      buffer_minutes: input.buffer_minutes,
      updated_at: new Date().toISOString(),
      updated_by_name: updatedByName,
    })
    .eq("id", SETTINGS_ID);

  if (error) return { error: "Failed to save availability settings." };
  return {};
}

export async function fetchWinsalotBlackouts(supabase: SupabaseClient): Promise<WinsalotBlackoutRow[]> {
  const { data } = await supabase.from(BLACKOUTS_TABLE).select("*").order("start_at", { ascending: true });
  return (data ?? []) as WinsalotBlackoutRow[];
}

export async function addWinsalotBlackout(
  supabase: SupabaseClient,
  input: { startAt: string; endAt: string; reason: string | null; createdBy: string }
): Promise<{ error?: string }> {
  if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
    return { error: "End time must be after start time." };
  }
  const { error } = await supabase.from(BLACKOUTS_TABLE).insert({
    start_at: input.startAt,
    end_at: input.endAt,
    reason: input.reason,
    created_by: input.createdBy,
  });
  if (error) return { error: "Failed to save the blocked period." };
  return {};
}

export async function removeWinsalotBlackout(supabase: SupabaseClient, id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from(BLACKOUTS_TABLE).delete().eq("id", id);
  if (error) return { error: "Failed to remove the blocked period." };
  return {};
}
