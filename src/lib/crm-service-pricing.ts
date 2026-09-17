import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LEAD_GENERATION_PRICE_CENTS, type ServicePricing } from "./detailed-service-pricing";

export async function getLeadGenerationPricing(supabase: SupabaseClient): Promise<ServicePricing> {
  const { data } = await supabase
    .from("crm_service_pricing")
    .select("price_cents, billing_period")
    .eq("service_key", "lead_generation")
    .maybeSingle();

  return {
    priceCents: data?.price_cents ?? DEFAULT_LEAD_GENERATION_PRICE_CENTS,
    billingPeriod: "month",
  };
}
