"use server";

import { redirect } from "next/navigation";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkDncSuppression } from "@/lib/dnc-suppression";

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

export async function createAgentLeadAction(formData: FormData) {
  const agent = await requireLeadgenAgent();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const clientId = String(formData.get("client_id") ?? "").trim();

  if (!businessName || !clientId) {
    redirect(`/leadgen/agent/leads/new?error=${encodeURIComponent("Business name and client are required.")}`);
  }

  const admin = getSupabaseAdmin();
  const { data: lead, error } = await admin
    .from("leadgen_leads")
    .insert({
      business_name: businessName,
      client_id: clientId,
      campaign_id: textOrNull(formData, "campaign_id"),
      industry: textOrNull(formData, "industry"),
      contact_name: textOrNull(formData, "contact_name"),
      decision_maker_name: textOrNull(formData, "decision_maker_name"),
      phone: textOrNull(formData, "phone"),
      email: textOrNull(formData, "email"),
      website: textOrNull(formData, "website"),
      city: textOrNull(formData, "city"),
      province: textOrNull(formData, "province"),
      lead_source: textOrNull(formData, "lead_source"),
      notes: textOrNull(formData, "notes"),
      assigned_agent_id: agent.id,
      created_by: agent.id,
    })
    .select("id")
    .single();

  if (error || !lead) {
    redirect(`/leadgen/agent/leads/new?error=${encodeURIComponent("Failed to save the lead.")}`);
  }

  // Item 8/9: this phone/email may already carry a restriction added from
  // either CRM - surface "Existing Do Not Contact restriction detected"
  // on the lead's own detail page rather than silently treating it as a
  // fresh, unrestricted prospect.
  const existingRestriction = await checkDncSuppression({ phone: textOrNull(formData, "phone"), email: textOrNull(formData, "email") });
  redirect(`/leadgen/agent/leads/${lead.id}?added=1${existingRestriction ? "&dncDetected=1" : ""}`);
}
