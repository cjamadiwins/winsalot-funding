"use server";

import { revalidatePath } from "next/cache";
import { consumeWinsalotActionToken } from "@/lib/winsalot-consultation-tokens";
import { performWinsalotCancellation, type WinsalotCancelResult } from "@/lib/winsalot-consultation-book";
import { getClientIpFromHeaders, isRateLimited } from "@/lib/rate-limit";

export async function cancelWinsalotAppointmentAction(token: string, reason: string | null): Promise<WinsalotCancelResult> {
  const ip = await getClientIpFromHeaders();
  if (isRateLimited(`winsalot-cancel:${ip}`)) {
    return { error: "Too many requests. Please wait a few minutes and try again." };
  }

  const consumed = await consumeWinsalotActionToken(token, "cancel");
  if (!consumed.ok) return { error: consumed.error };

  const result = await performWinsalotCancellation(consumed.appointmentId, reason, { role: "prospect", userId: null });

  if (!result.error) {
    revalidatePath("/admin/crm/appointments");
    revalidatePath("/agent/appointments");
  }

  return result;
}
