import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import type { SharedTrainingCompletionRow, SharedTrainingCrm } from "./shared-training-types";

// Reads through the session-scoped Supabase client, so RLS
// (crm_shared_training_completions_self_select / _admin_select, migration
// 0159) is the real access control here - these helpers just shape the
// query, not the permission.

export async function fetchOwnSharedTrainingCompletion(
  crm: SharedTrainingCrm,
  trainingKey: string,
  trainingVersion: number,
  userId: string
): Promise<SharedTrainingCompletionRow | null> {
  const supabase = await createSupabaseServerClient();
  const userColumn = crm === "growth" ? "crm_user_id" : "leadgen_user_id";

  const { data } = await supabase
    .from("crm_shared_training_completions")
    .select("*")
    .eq("training_key", trainingKey)
    .eq("training_version", trainingVersion)
    .eq(userColumn, userId)
    .maybeSingle();

  return (data as SharedTrainingCompletionRow | null) ?? null;
}

// Admin-only view (enforced by RLS) of every agent's completion status for
// this manual within one CRM - scoped to whichever user-id column that
// CRM's accounts populate, even though an admin's row-level access under
// crm_shared_training_completions_admin_select technically spans both.
export async function fetchSharedTrainingCompletionsForCrm(
  crm: SharedTrainingCrm,
  trainingKey: string,
  trainingVersion: number
): Promise<SharedTrainingCompletionRow[]> {
  const supabase = await createSupabaseServerClient();
  const userColumn = crm === "growth" ? "crm_user_id" : "leadgen_user_id";

  const { data } = await supabase
    .from("crm_shared_training_completions")
    .select("*")
    .eq("training_key", trainingKey)
    .eq("training_version", trainingVersion)
    .not(userColumn, "is", null)
    .order("completed_at", { ascending: false });

  return (data as SharedTrainingCompletionRow[] | null) ?? [];
}
