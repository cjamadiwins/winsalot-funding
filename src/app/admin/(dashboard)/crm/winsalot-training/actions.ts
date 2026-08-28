"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { parseTrainingListField, type TrainingModuleContent } from "@/lib/crm-training-types";
import type { CrmUserRow } from "@/lib/crm-types";

type ActionResult = { error?: string; moduleId?: string };

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function contentFromFormData(formData: FormData): TrainingModuleContent {
  return {
    learningObjective: String(formData.get("learningObjective") ?? "").trim(),
    explanation: String(formData.get("explanation") ?? "").trim(),
    steps: parseTrainingListField(String(formData.get("steps") ?? "")),
    examples: parseTrainingListField(String(formData.get("examples") ?? "")),
    approvedPhrases: parseTrainingListField(String(formData.get("approvedPhrases") ?? "")),
    phrasesToAvoid: parseTrainingListField(String(formData.get("phrasesToAvoid") ?? "")),
    commonMistakes: parseTrainingListField(String(formData.get("commonMistakes") ?? "")),
    keyReminders: parseTrainingListField(String(formData.get("keyReminders") ?? "")),
    summary: String(formData.get("summary") ?? "").trim(),
  };
}

async function recordAdminAction(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  admin: CrmUserRow,
  action:
    | "module_created"
    | "module_updated"
    | "module_reordered"
    | "module_activated"
    | "module_deactivated"
    | "module_required_changed"
    | "progress_reset",
  fields: { moduleId?: string; moduleTitle?: string; targetUserId?: string; targetUserName?: string; details?: string }
) {
  await supabase.from("crm_training_admin_actions").insert({
    admin_id: admin.id,
    admin_name: performedByName(admin),
    action,
    module_id: fields.moduleId ?? null,
    module_title: fields.moduleTitle ?? null,
    target_user_id: fields.targetUserId ?? null,
    target_user_name: fields.targetUserName ?? null,
    details: fields.details ?? null,
  });
}

function revalidateTrainingPaths() {
  revalidatePath("/admin/crm/winsalot-training");
  revalidatePath("/agent/winsalot-training");
}

// "Create a new module." Every new module starts inactive (a draft) so
// an admin can preview it before publishing (flip Active on once it's
// ready) - see canPreviewInactiveModule in AdminOpportunityDetailClient-
// style admin bypass: the admin reader route can open any module
// regardless of is_active, an agent's route never can.
export async function createTrainingModuleAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const content = contentFromFormData(formData);
  if (!content.learningObjective || !content.explanation || !content.summary) {
    return { error: "Learning objective, explanation, and summary are all required." };
  }

  const { data: maxSort } = await supabase.from("crm_training_modules").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextSortOrder = (maxSort?.sort_order ?? 0) + 1;

  const baseSlug = slugify(title) || "module";
  let slug = baseSlug;
  for (let attempt = 1; attempt < 50; attempt++) {
    const { count } = await supabase.from("crm_training_modules").select("id", { count: "exact", head: true }).eq("slug", slug);
    if (!count) break;
    slug = `${baseSlug}-${attempt + 1}`;
  }

  const { data: module, error } = await supabase
    .from("crm_training_modules")
    .insert({ slug, title, sort_order: nextSortOrder, is_required: formData.get("is_required") === "on", created_by: admin.id })
    .select("id, title")
    .single();
  if (error || !module) return { error: `Failed to create this module: ${error?.message ?? "Unknown error."}` };

  const { error: versionError } = await supabase.from("crm_training_module_versions").insert({
    module_id: module.id,
    version: 1,
    title,
    content,
    is_major_revision: true,
    created_by: admin.id,
  });
  if (versionError) return { error: `Module created, but failed to save its content: ${versionError.message}` };

  const { error: assignmentError } = await supabase.from("crm_training_module_assignments").insert({ module_id: module.id, assigned_role: "agent", created_by: admin.id });
  if (assignmentError) return { error: `Module created, but failed to assign it: ${assignmentError.message}` };

  await recordAdminAction(supabase, admin, "module_created", { moduleId: module.id, moduleTitle: module.title });

  revalidateTrainingPaths();
  return { moduleId: module.id };
}

// "Edit existing module content." `isMajorRevision` decides whether this
// save bumps current_version (a new crm_training_module_versions row,
// requiring every user to complete it again) or edits the existing
// version's content in place (a minor correction that never resets
// anyone's completion) - see migration 0105's own comment for why this
// is safe either way.
export async function updateTrainingModuleAction(moduleId: string, formData: FormData, isMajorRevision: boolean): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase.from("crm_training_modules").select("*").eq("id", moduleId).maybeSingle();
  if (fetchError || !existing) return { error: "Module not found." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const content = contentFromFormData(formData);
  if (!content.learningObjective || !content.explanation || !content.summary) {
    return { error: "Learning objective, explanation, and summary are all required." };
  }

  const targetVersion = isMajorRevision ? existing.current_version + 1 : existing.current_version;

  if (isMajorRevision) {
    const { error: insertError } = await supabase.from("crm_training_module_versions").insert({
      module_id: moduleId,
      version: targetVersion,
      title,
      content,
      is_major_revision: true,
      created_by: admin.id,
    });
    if (insertError) return { error: `Failed to save the new version: ${insertError.message}` };

    const { error: bumpError } = await supabase.from("crm_training_modules").update({ title, current_version: targetVersion, updated_by: admin.id }).eq("id", moduleId);
    if (bumpError) return { error: `Failed to publish the new version: ${bumpError.message}` };
  } else {
    const { error: updateError } = await supabase
      .from("crm_training_module_versions")
      .update({ title, content })
      .eq("module_id", moduleId)
      .eq("version", targetVersion);
    if (updateError) return { error: `Failed to save changes: ${updateError.message}` };

    const { error: titleError } = await supabase.from("crm_training_modules").update({ title, updated_by: admin.id }).eq("id", moduleId);
    if (titleError) return { error: `Failed to save changes: ${titleError.message}` };
  }

  await recordAdminAction(supabase, admin, "module_updated", {
    moduleId,
    moduleTitle: title,
    details: isMajorRevision ? `Published as a major revision (version ${targetVersion}) - agents must complete it again.` : "Minor edit - no re-completion required.",
  });

  revalidateTrainingPaths();
  return { moduleId };
}

// "Reorder modules." `orderedModuleIds` is the module id list in its new
// desired order; sort_order is rewritten to match that order exactly.
export async function reorderTrainingModulesAction(orderedModuleIds: string[]): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  for (let i = 0; i < orderedModuleIds.length; i++) {
    const { error } = await supabase.from("crm_training_modules").update({ sort_order: i + 1, updated_by: admin.id }).eq("id", orderedModuleIds[i]);
    if (error) return { error: `Failed to reorder modules: ${error.message}` };
  }

  await recordAdminAction(supabase, admin, "module_reordered", { details: `Reordered ${orderedModuleIds.length} module(s).` });

  revalidateTrainingPaths();
  return {};
}

// "Activate or deactivate modules."
export async function setModuleActiveAction(moduleId: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: module, error } = await supabase.from("crm_training_modules").update({ is_active: isActive, updated_by: admin.id }).eq("id", moduleId).select("id, title").single();
  if (error || !module) return { error: `Failed to update this module: ${error?.message ?? "Unknown error."}` };

  await recordAdminAction(supabase, admin, isActive ? "module_activated" : "module_deactivated", { moduleId, moduleTitle: module.title });

  revalidateTrainingPaths();
  return {};
}

// "Mark modules as required or optional."
export async function setModuleRequiredAction(moduleId: string, isRequired: boolean): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: module, error } = await supabase.from("crm_training_modules").update({ is_required: isRequired, updated_by: admin.id }).eq("id", moduleId).select("id, title").single();
  if (error || !module) return { error: `Failed to update this module: ${error?.message ?? "Unknown error."}` };

  await recordAdminAction(supabase, admin, "module_required_changed", { moduleId, moduleTitle: module.title, details: isRequired ? "Marked required." : "Marked optional." });

  revalidateTrainingPaths();
  return {};
}

// "Reset an agent's module progress when necessary, with confirmation."
// The confirmation itself is a client-side modal (ConfirmResetModal);
// this deletes the agent's current progress row for this module outright
// (putting them back to "not opened, not completed") while leaving a
// permanent record of the reset in crm_training_admin_actions - the
// audit trail survives even though the progress row itself is gone.
export async function resetAgentModuleProgressAction(targetUserId: string, moduleId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: targetUser }, { data: module }] = await Promise.all([
    supabase.from("crm_users").select("id, full_name, email").eq("id", targetUserId).maybeSingle(),
    supabase.from("crm_training_modules").select("id, title, current_version").eq("id", moduleId).maybeSingle(),
  ]);
  if (!targetUser) return { error: "Agent not found." };
  if (!module) return { error: "Module not found." };

  const { error } = await supabase
    .from("crm_training_progress")
    .delete()
    .eq("user_id", targetUserId)
    .eq("module_id", moduleId)
    .eq("module_version", module.current_version);
  if (error) return { error: `Failed to reset this agent's progress: ${error.message}` };

  await recordAdminAction(supabase, admin, "progress_reset", {
    moduleId,
    moduleTitle: module.title,
    targetUserId,
    targetUserName: targetUser.full_name || targetUser.email,
    details: `Progress reset by ${performedByName(admin)}.`,
  });

  revalidatePath(`/admin/crm/winsalot-training/progress/${targetUserId}`);
  revalidatePath("/admin/crm/winsalot-training/progress");
  return {};
}
