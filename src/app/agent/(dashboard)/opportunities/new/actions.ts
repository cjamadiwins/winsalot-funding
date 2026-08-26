"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { OPPORTUNITY_TYPES, type OpportunityType } from "@/lib/crm-types";

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function numberOrNull(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isoOrNull(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Mirrors the old createLeadAction (leads/new/actions.ts, now retired) -
// same required-field/redirect-with-error convention, extended for the
// type-conditional Lead Generation / Business Financing / Both Services
// field set (see OpportunityFieldsForm). assigned_agent_id/created_by are
// always the signed-in agent - never trusted from the client - matching
// the crm_opportunities_agent_insert_own RLS policy (migration 0080),
// which requires exactly that. `stage` is intentionally omitted so the
// table's own default ('New Prospect') applies.
export async function createOpportunityAction(formData: FormData) {
  const crmUser = await requireCrmUser();

  const opportunityTypeRaw = String(formData.get("opportunity_type") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!OPPORTUNITY_TYPES.includes(opportunityTypeRaw as OpportunityType)) {
    redirect(`/agent/opportunities/new?error=${encodeURIComponent("Choose an opportunity type.")}`);
  }
  if (!businessName || !phone) {
    redirect(
      `/agent/opportunities/new?error=${encodeURIComponent("Business name and phone are required.")}`
    );
  }

  const opportunityType = opportunityTypeRaw as OpportunityType;
  const supabase = await createSupabaseServerClient();

  const { data: opportunity, error } = await supabase
    .from("crm_opportunities")
    .insert({
      opportunity_type: opportunityType,
      business_name: businessName,
      contact_name: textOrNull(formData, "contact_name"),
      phone,
      email: textOrNull(formData, "email"),
      city: textOrNull(formData, "city"),
      province_state: textOrNull(formData, "province_state"),
      notes: textOrNull(formData, "notes"),

      industry: textOrNull(formData, "industry"),
      target_customers: textOrNull(formData, "target_customers"),
      current_marketing_method: textOrNull(formData, "current_marketing_method"),
      appointments_wanted: numberOrNull(formData, "appointments_wanted"),
      estimated_monthly_budget: numberOrNull(formData, "estimated_monthly_budget"),
      consultation_date: isoOrNull(formData, "consultation_date"),

      business_structure: textOrNull(formData, "business_structure"),
      time_in_business: textOrNull(formData, "time_in_business"),
      average_monthly_revenue: numberOrNull(formData, "average_monthly_revenue"),
      financing_amount_requested: numberOrNull(formData, "financing_amount_requested"),
      bank_statements_available: formData.get("bank_statements_available") === "on",
      application_status: textOrNull(formData, "application_status"),

      assigned_agent_id: crmUser.id,
      created_by: crmUser.id,
    })
    .select("id")
    .single();

  if (error || !opportunity) {
    redirect(`/agent/opportunities/new?error=${encodeURIComponent("Failed to save the opportunity.")}`);
  }

  redirect(`/agent/opportunities/${opportunity.id}?added=1`);
}
