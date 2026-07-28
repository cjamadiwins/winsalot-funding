"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type ActionResult = { error?: string };

export async function createTemplateAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!key || !name || !subject || !body) return { error: "Key, name, subject, and body are all required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_email_templates").insert({
    key,
    name,
    subject,
    body,
    description: String(formData.get("description") ?? "").trim() || null,
    created_by: admin.id,
  });

  if (error) {
    if (error.code === "23505") return { error: `A template with the key "${key}" already exists.` };
    return { error: "Failed to create the template." };
  }

  revalidatePath("/leadgen/admin/templates");
  return {};
}

export async function updateTemplateAction(templateId: string, formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!name || !subject || !body) return { error: "Name, subject, and body are all required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("leadgen_email_templates")
    .update({
      name,
      subject,
      body,
      description: String(formData.get("description") ?? "").trim() || null,
      active: formData.get("active") !== "false",
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId);

  if (error) return { error: "Failed to update the template." };

  revalidatePath("/leadgen/admin/templates");
  return {};
}
