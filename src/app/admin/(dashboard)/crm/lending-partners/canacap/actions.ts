"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { CANACAP_DOCUMENTS, isCanacapStatus } from "@/lib/crm-canacap-types";

type ActionResult = { error?: string };

const PAGE = "/admin/crm/lending-partners/canacap";

function optionalText(raw: FormDataEntryValue | null): string | null {
  return String(raw ?? "").trim() || null;
}

function parseFields(formData: FormData) {
  const status = String(formData.get("status") ?? "");
  const dateSubmitted = optionalText(formData.get("date_submitted"));
  return {
    status: isCanacapStatus(status) ? status : null,
    dateSubmitted: dateSubmitted && /^\d{4}-\d{2}-\d{2}$/.test(dateSubmitted) ? dateSubmitted : null,
    owner_name: optionalText(formData.get("owner_name")),
    notes: optionalText(formData.get("notes")),
    docs: Object.fromEntries(CANACAP_DOCUMENTS.map((d) => [d.field, formData.get(d.field) === "on"])),
  };
}

export async function createCanacapApplicationAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const businessName = String(formData.get("business_name") ?? "").trim();
  if (!businessName) return { error: "Client business name is required." };
  const f = parseFields(formData);
  if (!f.status) return { error: "Select a valid status." };

  const { error } = await supabase.from("crm_canacap_applications").insert({
    created_by: admin.id,
    business_name: businessName,
    owner_name: f.owner_name,
    status: f.status,
    date_submitted: f.dateSubmitted,
    notes: f.notes,
    ...f.docs,
  });
  if (error) return { error: `Failed to save this application: ${error.message}` };

  revalidatePath(PAGE);
  return {};
}

export async function updateCanacapApplicationAction(id: string, formData: FormData): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const f = parseFields(formData);
  if (!f.status) return { error: "Select a valid status." };

  const { error } = await supabase
    .from("crm_canacap_applications")
    .update({
      owner_name: f.owner_name,
      status: f.status,
      date_submitted: f.dateSubmitted,
      notes: f.notes,
      ...f.docs,
    })
    .eq("id", id);
  if (error) return { error: `Failed to update this application: ${error.message}` };

  revalidatePath(PAGE);
  return {};
}
