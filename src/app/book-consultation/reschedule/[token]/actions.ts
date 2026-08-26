"use server";

import { revalidatePath } from "next/cache";
import { consumeWinsalotActionToken, releaseWinsalotActionToken } from "@/lib/winsalot-consultation-tokens";
import { performWinsalotReschedule, type WinsalotRescheduleResult } from "@/lib/winsalot-consultation-book";
import { getClientIpFromHeaders, isRateLimited } from "@/lib/rate-limit";

// Public reschedule submission, reached only via a valid, unused,
// unexpired reschedule token (see src/lib/winsalot-consultation-tokens.ts) -
// the token is atomically consumed here, at the moment of submission, not
// when the page was merely viewed, so opening the link twice without
// submitting never burns it. Consuming happens before the actual
// reschedule so two concurrent submits of the same link can never both
// go through - but performWinsalotReschedule can still fail for reasons
// that have nothing to do with the token itself (the newly-selected slot
// was booked by someone else in the meantime, a transient DB error,
// etc.), so a failure releases the token back to unused rather than
// permanently burning the prospect's one link over an error that isn't
// theirs - only a genuinely successful reschedule keeps it consumed.
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

  if (result.error) {
    await releaseWinsalotActionToken(token, "reschedule");
    return result;
  }

  revalidatePath("/admin/crm/appointments");
  revalidatePath("/agent/appointments");
  return result;
}
