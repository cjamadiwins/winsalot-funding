"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseLeadsCsv } from "@/lib/leadgen-csv";

type ActionResult = { error?: string };

export async function createLeadAction(formData: FormData): Promise<ActionResult & { leadId?: string }> {
  const adminUser = await requireLeadgenAdmin();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!businessName) return { error: "Business name is required." };
  if (!clientId) return { error: "Select a client." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_leads")
    .insert({
      business_name: businessName,
      client_id: clientId,
      campaign_id: String(formData.get("campaign_id") ?? "").trim() || null,
      industry: String(formData.get("industry") ?? "").trim() || null,
      contact_name: String(formData.get("contact_name") ?? "").trim() || null,
      decision_maker_name: String(formData.get("decision_maker_name") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      website: String(formData.get("website") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      province: String(formData.get("province") ?? "").trim() || null,
      lead_source: String(formData.get("lead_source") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      created_by: adminUser.id,
    })
    .select("id")
    .single();

  if (error) return { error: "Failed to create the lead." };

  revalidatePath("/leadgen/admin/leads");
  return { leadId: data.id as string };
}

// Brief: "Can upload leads by CSV." Expected columns (case-insensitive,
// any order): Business Name (required, or "Company"/"Company Name"),
// Industry, Contact Name, Decision Maker/Owner, Phone, Email, Website,
// City, Province, Lead Source, Notes.
export async function uploadLeadsCsvAction(formData: FormData): Promise<ActionResult & { imported?: number; skipped?: string[] }> {
  const adminUser = await requireLeadgenAdmin();

  const clientId = String(formData.get("client_id") ?? "").trim();
  const campaignId = String(formData.get("campaign_id") ?? "").trim() || null;
  const defaultLeadSource = String(formData.get("lead_source") ?? "").trim() || null;
  const file = formData.get("file");

  if (!clientId) return { error: "Select which client these leads belong to." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to upload." };
  if (file.size > 5 * 1024 * 1024) return { error: "The file is too large (5MB max)." };

  const text = await file.text();
  const { rows, errors } = parseLeadsCsv(text);

  if (rows.length === 0) {
    return { error: errors[0] ?? "No valid rows found in this file." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_leads").insert(
    rows.map((row) => ({
      business_name: row.business_name,
      industry: row.industry ?? null,
      contact_name: row.contact_name ?? null,
      decision_maker_name: row.decision_maker_name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      website: row.website ?? null,
      city: row.city ?? null,
      province: row.province ?? null,
      lead_source: row.lead_source ?? defaultLeadSource,
      notes: row.notes ?? null,
      client_id: clientId,
      campaign_id: campaignId,
      created_by: adminUser.id,
    }))
  );

  if (error) return { error: "Failed to save the imported leads." };

  revalidatePath("/leadgen/admin/leads");
  return { imported: rows.length, skipped: errors };
}

async function logAssignmentActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  leadId: string,
  agentId: string | null,
  adminName: string,
  wasAssigned: boolean
) {
  let agentName = "Unassigned";
  if (agentId) {
    const { data: agent } = await supabase.from("leadgen_users").select("full_name").eq("id", agentId).maybeSingle();
    agentName = agent?.full_name ?? "an agent";
  }
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: null,
    activity_type: wasAssigned ? "lead_reassigned" : "lead_assigned",
    notes: agentId ? `Assigned to ${agentName} by ${adminName}.` : `Unassigned by ${adminName}.`,
  });
}

export async function assignLeadAction(leadId: string, agentId: string | null): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("leadgen_leads").select("assigned_agent_id").eq("id", leadId).maybeSingle();

  const { error } = await supabase.from("leadgen_leads").update({ assigned_agent_id: agentId }).eq("id", leadId);
  if (error) return { error: "Failed to assign this lead." };

  await logAssignmentActivity(supabase, leadId, agentId, adminUser.full_name || adminUser.email, Boolean(existing?.assigned_agent_id));

  revalidatePath("/leadgen/admin/leads");
  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return {};
}

export async function deleteLeadgenLeadAction(leadId: string): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("leadgen_delete_lead", { p_lead_id: leadId });
  if (error) return { error: error.message || "Failed to delete the lead." };

  revalidatePath("/leadgen/admin");
  revalidatePath("/leadgen/admin/leads");
  revalidatePath("/leadgen/admin/appointments");
  revalidatePath("/leadgen/admin/emails");
  return {};
}

export async function bulkAssignLeadsAction(leadIds: string[], agentId: string | null): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  if (leadIds.length === 0) return { error: "Select at least one lead." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_leads").update({ assigned_agent_id: agentId }).in("id", leadIds);
  if (error) return { error: "Failed to bulk-assign these leads." };

  await supabase.from("leadgen_lead_activities").insert(
    leadIds.map((leadId) => ({
      lead_id: leadId,
      agent_id: null,
      activity_type: "lead_assigned" as const,
      notes: agentId
        ? `Bulk-assigned by ${adminUser.full_name || adminUser.email}.`
        : `Bulk-unassigned by ${adminUser.full_name || adminUser.email}.`,
    }))
  );

  revalidatePath("/leadgen/admin/leads");
  return {};
}
