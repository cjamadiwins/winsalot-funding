"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import { requireCrmUser } from "./crm-auth";

type ActionResult = { error?: string };

// Shared by both the agent's own Training dashboard and an admin's "view
// as a learner" experience - requireCrmUser() accepts either role, and
// RLS (crm_training_progress_self_insert/self_update) scopes every write
// to the caller's own row regardless of which route called this.
//
// "A user must open a module before marking it complete" - this is the
// only thing that ever creates a crm_training_progress row, always
// against the module's *current* version, so re-opening a module after a
// major revision starts a fresh row for the new version rather than
// reusing the old (already-completed) one.
export async function markModuleOpenedAction(moduleId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: module, error: moduleError } = await supabase.from("crm_training_modules").select("id, current_version").eq("id", moduleId).maybeSingle();
  if (moduleError || !module) return { error: "Training module not found." };

  const { data: existing } = await supabase
    .from("crm_training_progress")
    .select("id")
    .eq("user_id", user.id)
    .eq("module_id", moduleId)
    .eq("module_version", module.current_version)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("crm_training_progress").insert({
      user_id: user.id,
      module_id: moduleId,
      module_version: module.current_version,
    });
    if (error) return { error: "Failed to record that you opened this module." };
  }

  return {};
}

export async function markModuleCompleteAction(moduleId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: module, error: moduleError } = await supabase.from("crm_training_modules").select("id, current_version").eq("id", moduleId).maybeSingle();
  if (moduleError || !module) return { error: "Training module not found." };

  const { data: existing } = await supabase
    .from("crm_training_progress")
    .select("id, completed_at")
    .eq("user_id", user.id)
    .eq("module_id", moduleId)
    .eq("module_version", module.current_version)
    .maybeSingle();

  // "A user must open a module before marking it complete" - enforced
  // here (no row yet for the current version means it was never opened)
  // and again at the database level (crm_training_progress_open_before_
  // complete), so this can't be bypassed by calling the action directly.
  if (!existing) return { error: "Open this module before marking it complete." };
  if (existing.completed_at) return {};

  const { error } = await supabase.from("crm_training_progress").update({ completed_at: new Date().toISOString() }).eq("id", existing.id);
  if (error) return { error: "Failed to mark this module complete." };

  revalidatePath("/agent/winsalot-training");
  revalidatePath("/admin/crm/winsalot-training");
  return {};
}
