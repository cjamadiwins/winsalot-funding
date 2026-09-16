"use server";

import { performWinsalotContinueRequest, type WinsalotContinueRequestResult } from "@/lib/winsalot-continue-request";
import { getClientIpFromHeaders, isRateLimited } from "@/lib/rate-limit";
import type { OpportunityType } from "@/lib/crm-types";

export type SubmitWinsalotContinueRequestInput = {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  serviceType: OpportunityType;
  notes: string;
};

// Public, unauthenticated submission for /continue-with-winsalot. No
// Supabase session exists here, so every write goes through the
// service-role client inside performWinsalotContinueRequest - same
// pattern as bookWinsalotConsultationAction.
export async function submitWinsalotContinueRequestAction(input: SubmitWinsalotContinueRequestInput): Promise<WinsalotContinueRequestResult> {
  const ip = await getClientIpFromHeaders();
  if (isRateLimited(`winsalot-continue:${ip}`)) {
    return { error: "Too many requests. Please wait a few minutes and try again." };
  }

  return performWinsalotContinueRequest({
    contactName: input.contactName,
    businessName: input.businessName,
    email: input.email,
    phone: input.phone,
    serviceType: input.serviceType,
    notes: input.notes.trim() ? input.notes.trim() : null,
  });
}
