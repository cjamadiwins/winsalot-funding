"use server";

import { revalidatePath } from "next/cache";
import { performWinsalotBooking, type WinsalotBookingResult } from "@/lib/winsalot-consultation-book";
import { resolveWinsalotPrefillToken } from "@/lib/winsalot-consultation-tokens";
import { getClientIpFromHeaders, isRateLimited } from "@/lib/rate-limit";
import type { OpportunityType } from "@/lib/crm-types";

export type BookWinsalotConsultationInput = {
  prefillToken: string | null;
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  smsConsent: boolean;
  serviceType: OpportunityType;
  notes: string;
  startUtcIso: string;
  prospectTimezone: string;
};

// Public, unauthenticated booking submission for /book-consultation. No
// Supabase session exists here, so every write goes through the
// service-role client inside performWinsalotBooking (same pattern as the
// Lead Gen CRM's /book/[slug] public action) - never the anon/session
// client, and never anything that could expose SUPABASE_SERVICE_ROLE_KEY
// itself to the browser (it's read server-side only, inside
// src/lib/supabase-admin.ts).
export async function bookWinsalotConsultationAction(input: BookWinsalotConsultationInput): Promise<WinsalotBookingResult> {
  const ip = await getClientIpFromHeaders();
  if (isRateLimited(`winsalot-book:${ip}`)) {
    return { error: "Too many requests. Please wait a few minutes and try again." };
  }

  let opportunityId: string | null = null;
  if (input.prefillToken) {
    const lookup = await resolveWinsalotPrefillToken(input.prefillToken);
    if (lookup.ok) opportunityId = lookup.opportunityId;
  }

  const result = await performWinsalotBooking({
    opportunityId,
    contactName: input.contactName,
    businessName: input.businessName,
    email: input.email,
    phone: input.phone,
    smsConsent: input.smsConsent,
    serviceType: input.serviceType,
    notes: input.notes.trim() ? input.notes.trim() : null,
    startUtcIso: input.startUtcIso,
    prospectTimezone: input.prospectTimezone || null,
    bookedBy: "self",
    bookedByUserId: null,
    assignedAgentId: null,
  });

  if (!result.error) {
    revalidatePath("/admin/crm/appointments");
    revalidatePath("/agent/appointments");
  }

  return result;
}
