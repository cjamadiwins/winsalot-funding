"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import {
  addOrUpdateDncSuppression,
  editDncSuppressionNotes,
  getDncAuditLog,
  importDncCsv,
  reactivateDncSuppression,
  removeDncSuppression,
  type DncChannel,
} from "@/lib/dnc-suppression";

type ActionResult = { error?: string; success?: string };

// Item 3: any signed-in agent may add a restriction, but this whole
// /admin/crm/do-not-contact page (and every action in this file) is
// admin-only - requireCrmAdmin() gates it same as every other admin-only
// CRM page. Agents add restrictions from the Call Log's "Do Not Call"
// outcome instead (see src/app/agent/(dashboard)/call-log/actions.ts).
export async function addSuppressionAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const channels = formData.getAll("channels").filter((c): c is DncChannel => c === "phone" || c === "sms" || c === "email");

  const result = await addOrUpdateDncSuppression({
    contactName: String(formData.get("contact_name") ?? "").trim() || null,
    businessName: String(formData.get("business_name") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    sourceCrm: "growth",
    reason: String(formData.get("reason") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim() || null,
    addedByUserId: admin.id,
    addedByName: admin.full_name || admin.email,
    channels,
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/crm/do-not-contact");
  return { success: "Added to the Do Not Contact list." };
}

export async function removeSuppressionAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const result = await removeDncSuppression({
    id: String(formData.get("id") ?? ""),
    adminId: admin.id,
    adminName: admin.full_name || admin.email,
    sourceCrm: "growth",
    removalReason: String(formData.get("removal_reason") ?? ""),
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/crm/do-not-contact");
  return { success: "Restriction removed." };
}

export async function reactivateSuppressionAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const result = await reactivateDncSuppression({
    id: String(formData.get("id") ?? ""),
    adminId: admin.id,
    adminName: admin.full_name || admin.email,
    sourceCrm: "growth",
    reason: String(formData.get("reason") ?? ""),
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/crm/do-not-contact");
  return { success: "Restriction reactivated." };
}

export async function editSuppressionAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const result = await editDncSuppressionNotes({
    id: String(formData.get("id") ?? ""),
    adminId: admin.id,
    adminName: admin.full_name || admin.email,
    sourceCrm: "growth",
    reason: String(formData.get("reason") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/crm/do-not-contact");
  return { success: "Saved." };
}

export async function getAuditLogAction(suppressionId: string) {
  await requireCrmAdmin();
  return getDncAuditLog(suppressionId);
}

export async function importDncCsvAction(formData: FormData): Promise<{ error?: string; added?: number; merged?: number; skipped?: number }> {
  const admin = await requireCrmAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };

  const text = await file.text();
  const result = await importDncCsv({
    text,
    sourceCrm: "growth",
    adminId: admin.id,
    adminName: admin.full_name || admin.email,
    defaultReason: "Imported via CSV",
  });

  revalidatePath("/admin/crm/do-not-contact");
  return result;
}
