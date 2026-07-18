"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

export async function createLeadAction(formData: FormData) {
  const crmUser = await requireCrmUser();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const serviceRequested = String(formData.get("service_requested") ?? "").trim();

  if (!businessName || !phone || !city || !serviceRequested) {
    redirect(
      `/agent/leads/new?error=${encodeURIComponent(
        "Business name, phone, city, and service requested are required."
      )}`
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: lead, error } = await supabase
    .from("crm_leads")
    .insert({
      business_name: businessName,
      contact_name: textOrNull(formData, "contact_name"),
      phone,
      email: textOrNull(formData, "email"),
      city,
      service_address: textOrNull(formData, "service_address"),
      service_requested: serviceRequested,
      property_type: textOrNull(formData, "property_type"),
      approximate_size: textOrNull(formData, "approximate_size"),
      cleaning_frequency: textOrNull(formData, "cleaning_frequency"),
      preferred_start_date: textOrNull(formData, "preferred_start_date"),
      best_time_to_contact: textOrNull(formData, "best_time_to_contact"),
      lead_source: textOrNull(formData, "lead_source"),
      notes: textOrNull(formData, "notes"),
      // Never trust a client-supplied agent id - a lead an agent creates
      // is always assigned to themselves (enforced again by the
      // crm_leads_agent_insert_own RLS policy).
      assigned_agent_id: crmUser.id,
      created_by: crmUser.id,
    })
    .select("id")
    .single();

  if (error || !lead) {
    redirect(`/agent/leads/new?error=${encodeURIComponent("Failed to save the lead.")}`);
  }

  redirect(`/agent/leads/${lead.id}?added=1`);
}
