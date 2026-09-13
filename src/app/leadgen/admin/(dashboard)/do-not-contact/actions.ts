"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
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

// Item 3/4: agents add restrictions from the Call Log's "Do Not Call"
// outcome (src/app/leadgen/agent/(dashboard)/call-log/actions.ts); this
// whole /leadgen/admin/do-not-contact page and every action here is
// admin-only via requireLeadgenAdmin().
export async function addSuppressionAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const channels = formData.getAll("channels").filter((c): c is DncChannel => c === "phone" || c === "sms" || c === "email");

  const result = await addOrUpdateDncSuppression({
    contactName: String(formData.get("contact_name") ?? "").trim() || null,
    businessName: String(formData.get("business_name") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    sourceCrm: "lead_generation",
    reason: String(formData.get("reason") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim() || null,
    addedByUserId: admin.id,
    addedByName: admin.full_name || admin.email,
    channels,
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/leadgen/admin/do-not-contact");
  return { success: "Added to the Do Not Contact list." };
}

export async function removeSuppressionAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const result = await removeDncSuppression({
    id: String(formData.get("id") ?? ""),
    adminId: admin.id,
    adminName: admin.full_name || admin.email,
    sourceCrm: "lead_generation",
    removalReason: String(formData.get("removal_reason") ?? ""),
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/leadgen/admin/do-not-contact");
  return { success: "Restriction removed." };
}

export async function reactivateSuppressionAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const result = await reactivateDncSuppression({
    id: String(formData.get("id") ?? ""),
    adminId: admin.id,
    adminName: admin.full_name || admin.email,
    sourceCrm: "lead_generation",
    reason: String(formData.get("reason") ?? ""),
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/leadgen/admin/do-not-contact");
  return { success: "Restriction reactivated." };
}

export async function editSuppressionAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const result = await editDncSuppressionNotes({
    id: String(formData.get("id") ?? ""),
    adminId: admin.id,
    adminName: admin.full_name || admin.email,
    sourceCrm: "lead_generation",
    reason: String(formData.get("reason") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/leadgen/admin/do-not-contact");
  return { success: "Saved." };
}

export async function getAuditLogAction(suppressionId: string) {
  await requireLeadgenAdmin();
  return getDncAuditLog(suppressionId);
}

export async function importDncCsvAction(formData: FormData): Promise<{ error?: string; added?: number; merged?: number; skipped?: number }> {
  const admin = await requireLeadgenAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };

  const text = await file.text();
  const result = await importDncCsv({
    text,
    sourceCrm: "lead_generation",
    adminId: admin.id,
    adminName: admin.full_name || admin.email,
    defaultReason: "Imported via CSV",
  });

  revalidatePath("/leadgen/admin/do-not-contact");
  return result;
}
