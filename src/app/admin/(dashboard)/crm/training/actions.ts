"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";

// Every action below returns { error } instead of throwing, matching the
// pattern in crm/agents/actions.ts - Next.js redacts thrown Server Action
// errors to a generic message in production, which would swallow our own
// deliberate validation messages too.
type ActionResult = { error?: string };

export async function createTrainingMaterialAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!title || !content) {
    return { error: "Title and content are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_training_materials").insert({
    title,
    content,
    created_by: admin.id,
  });

  if (error) return { error: "Failed to save the training material." };

  revalidatePath("/admin/crm/training");
  revalidatePath("/agent/training");
  return {};
}

export async function updateTrainingMaterialAction(
  materialId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireCrmAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!title || !content) {
    return { error: "Title and content are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_training_materials")
    .update({ title, content })
    .eq("id", materialId);

  if (error) return { error: "Failed to update the training material." };

  revalidatePath("/admin/crm/training");
  revalidatePath("/agent/training");
  return {};
}

export async function deleteTrainingMaterialAction(materialId: string): Promise<ActionResult> {
  await requireCrmAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_training_materials").delete().eq("id", materialId);

  if (error) return { error: "Failed to remove the training material." };

  revalidatePath("/admin/crm/training");
  revalidatePath("/agent/training");
  return {};
}
