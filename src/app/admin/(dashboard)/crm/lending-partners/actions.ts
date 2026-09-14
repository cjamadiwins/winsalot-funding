"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { LENDING_PARTNER_CONTACT_TYPES, isLendingPartnerContactType, type LendingPartnerContactType } from "@/lib/crm-lending-partners-types";
import type { CrmUserRow } from "@/lib/crm-types";

type ActionResult = { error?: string; partnerId?: string };

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

function parseOptionalText(raw: FormDataEntryValue | null): string | null {
  const str = String(raw ?? "").trim();
  return str || null;
}

async function logPartnerActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  partnerId: string,
  agentId: string,
  notes: string
) {
  await supabase.from("crm_activities").insert({
    lending_partner_id: partnerId,
    agent_id: agentId,
    activity_type: "note",
    notes,
  });
}

// "Add Lending Partner" - company_name and contact_type are the only
// required fields (mirrors crm_clients' "company_name is the only
// always-known field" rule); everything else is left null/editable.
export async function createLendingPartnerAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { error: "Company name is required." };

  const contactTypeRaw = String(formData.get("contact_type") ?? "").trim();
  if (!isLendingPartnerContactType(contactTypeRaw)) return { error: "Select a valid contact type." };

  const { data, error } = await supabase
    .from("crm_lending_partners")
    .insert({
      created_by: admin.id,
      company_name: companyName,
      contact_name: parseOptionalText(formData.get("contact_name")),
      job_title: parseOptionalText(formData.get("job_title")),
      email: parseOptionalText(formData.get("email")),
      phone: parseOptionalText(formData.get("phone")),
      contact_type: contactTypeRaw,
      relationship_status: parseOptionalText(formData.get("relationship_status")),
      submission_email: parseOptionalText(formData.get("submission_email")),
      commission_notes: parseOptionalText(formData.get("commission_notes")),
      notes: parseOptionalText(formData.get("notes")),
    })
    .select("id")
    .single();

  if (error || !data) return { error: `Failed to create this lending partner: ${error?.message ?? "Unknown error."}` };

  await logPartnerActivity(supabase, data.id, admin.id, `Lending partner created by ${performedByName(admin)}.`);

  revalidatePath("/admin/crm/lending-partners");
  return { partnerId: data.id };
}

export async function updateLendingPartnerAction(partnerId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("crm_lending_partners").select("id").eq("id", partnerId).maybeSingle();
  if (!existing) return { error: "Lending partner not found." };

  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { error: "Company name is required." };

  const contactTypeRaw = String(formData.get("contact_type") ?? "").trim();
  if (!isLendingPartnerContactType(contactTypeRaw)) return { error: "Select a valid contact type." };

  const updates = {
    company_name: companyName,
    contact_name: parseOptionalText(formData.get("contact_name")),
    job_title: parseOptionalText(formData.get("job_title")),
    email: parseOptionalText(formData.get("email")),
    phone: parseOptionalText(formData.get("phone")),
    contact_type: contactTypeRaw as LendingPartnerContactType,
    relationship_status: parseOptionalText(formData.get("relationship_status")),
    submission_email: parseOptionalText(formData.get("submission_email")),
    commission_notes: parseOptionalText(formData.get("commission_notes")),
    notes: parseOptionalText(formData.get("notes")),
  };

  const { error } = await supabase.from("crm_lending_partners").update(updates).eq("id", partnerId);
  if (error) return { error: `Failed to save changes: ${error.message}` };

  await logPartnerActivity(supabase, partnerId, admin.id, `Lending partner profile updated by ${performedByName(admin)}.`);

  revalidatePath("/admin/crm/lending-partners");
  revalidatePath(`/admin/crm/lending-partners/${partnerId}`);
  return { partnerId };
}

export async function assignLendingPartnerAgentAction(partnerId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const agentId = parseOptionalText(formData.get("agent_id"));
  const { error } = await supabase.from("crm_lending_partners").update({ assigned_agent_id: agentId }).eq("id", partnerId);
  if (error) return { error: `Failed to update the assigned agent: ${error.message}` };

  await logPartnerActivity(
    supabase,
    partnerId,
    admin.id,
    agentId ? `Assigned agent changed by ${performedByName(admin)}.` : `Assigned agent cleared by ${performedByName(admin)}.`
  );

  revalidatePath(`/admin/crm/lending-partners/${partnerId}`);
  return { partnerId };
}

// Adds a free-text timeline entry - the same "Log Activity" concept every
// other section of this CRM already has (crm_activities note/call/email/
// outcome).
export async function logLendingPartnerActivityAction(partnerId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const notes = String(formData.get("notes") ?? "").trim();
  if (!notes) return { error: "Enter a note before logging it." };

  await logPartnerActivity(supabase, partnerId, admin.id, notes);

  revalidatePath(`/admin/crm/lending-partners/${partnerId}`);
  return { partnerId };
}

// Archive/unarchive rather than delete, matching crm_clients' preference
// for preserving history (this partner's crm_activities timeline and
// hubspot_record_id traceability stay intact either way).
export async function archiveLendingPartnerAction(partnerId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_lending_partners")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.id })
    .eq("id", partnerId);
  if (error) return { error: `Failed to archive this lending partner: ${error.message}` };

  await logPartnerActivity(supabase, partnerId, admin.id, `Archived by ${performedByName(admin)}.`);

  revalidatePath("/admin/crm/lending-partners");
  revalidatePath(`/admin/crm/lending-partners/${partnerId}`);
  return { partnerId };
}

export async function unarchiveLendingPartnerAction(partnerId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_lending_partners").update({ archived_at: null, archived_by: null }).eq("id", partnerId);
  if (error) return { error: `Failed to restore this lending partner: ${error.message}` };

  await logPartnerActivity(supabase, partnerId, admin.id, `Restored from archive by ${performedByName(admin)}.`);

  revalidatePath("/admin/crm/lending-partners");
  revalidatePath(`/admin/crm/lending-partners/${partnerId}`);
  return { partnerId };
}

export { LENDING_PARTNER_CONTACT_TYPES };
