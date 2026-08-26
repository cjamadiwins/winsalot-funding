"use server";

import { revalidatePath } from "next/cache";
import { consumeWinsalotActionToken } from "@/lib/winsalot-consultation-tokens";
import { performWinsalotReschedule, type WinsalotRescheduleResult } from "@/lib/winsalot-consultation-book";
import { getClientIpFromHeaders, isRateLimited } from "@/lib/rate-limit";

// Public reschedule submission, reached only via a valid, unused,
// unexpired reschedule token (see src/lib/winsalot-consultation-tokens.ts) -
// the token is atomically consumed here, at the moment of submission, not
// when the page was merely viewed, so opening the link twice without
// submitting never burns it.
export async function rescheduleWinsalotAppointmentAction(
  token: string,
  newStartUtcIso: string,
  prospectTimezone: string
): Promise<WinsalotRescheduleResult> {
  const ip = await getClientIpFromHeaders();
  if (isRateLimited(`winsalot-reschedule:${ip}`)) {
    return { error: "Too many requests. Please wait a few minutes and try again." };
  }

  const consumed = await consumeWinsalotActionToken(token, "reschedule");
  if (!consumed.ok) return { error: consumed.error };

  const result = await performWinsalotReschedule(consumed.appointmentId, newStartUtcIso, prospectTimezone, {
    role: "prospect",
    userId: null,
  });

  if (!result.error) {
    revalidatePath("/admin/crm/appointments");
    revalidatePath("/agent/appointments");
  }

  return result;
}
