"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function fieldsFromFormData(formData: FormData) {
  return {
    company_name: String(formData.get("companyName") ?? "").trim(),
    contact_person: String(formData.get("contactPerson") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    service_locations: String(formData.get("serviceLocations") ?? "").trim() || null,
    pricing_notes: String(formData.get("pricingNotes") ?? "").trim() || null,
    internal_notes: String(formData.get("internalNotes") ?? "").trim() || null,
  };
}

export async function createProviderAction(formData: FormData) {
  await requireAdminUser();

  const fields = fieldsFromFormData(formData);
  if (!isNonEmptyString(fields.company_name, 200)) {
    throw new Error("Company name is required.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("cleaning_providers").insert(fields);

  if (error) throw new Error("Failed to create provider.");

  revalidatePath("/admin/providers");
}

export async function updateProviderAction(providerId: string, formData: FormData) {
  await requireAdminUser();

  const fields = fieldsFromFormData(formData);
  if (!isNonEmptyString(fields.company_name, 200)) {
    throw new Error("Company name is required.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("cleaning_providers")
    .update(fields)
    .eq("id", providerId);

  if (error) throw new Error("Failed to update provider.");

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${providerId}`);
  redirect("/admin/providers");
}

export async function setProviderStatusAction(providerId: string, status: "active" | "inactive") {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("cleaning_providers")
    .update({ status })
    .eq("id", providerId);

  if (error) throw new Error("Failed to update provider status.");

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${providerId}`);
}
