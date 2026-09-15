"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import { requireCrmUser } from "./crm-auth";
import { requireLeadgenUser } from "./leadgen-auth";
import type { SharedTrainingCrm } from "./shared-training-types";

type ActionResult = { error?: string };

// Records (or overwrites, on retake) the caller's own completion of a
// shared training manual. `crm` picks which auth gate and which
// crm_shared_training_completions user-id column applies - see that
// migration's header for why one shared table uses two nullable FK
// columns instead of a single users table.
export async function submitSharedTrainingCompletionAction(
  crm: SharedTrainingCrm,
  trainingKey: string,
  trainingVersion: number,
  quizScore: number,
  quizTotal: number,
  passed: boolean
): Promise<ActionResult> {
  if (!Number.isFinite(quizScore) || !Number.isFinite(quizTotal) || quizTotal <= 0 || quizScore < 0 || quizScore > quizTotal) {
    return { error: "Invalid quiz result." };
  }

  const user = crm === "growth" ? await requireCrmUser() : await requireLeadgenUser();
  const supabase = await createSupabaseServerClient();
  const userColumn = crm === "growth" ? "crm_user_id" : "leadgen_user_id";

  const { error } = await supabase.from("crm_shared_training_completions").upsert(
    {
      training_key: trainingKey,
      training_version: trainingVersion,
      [userColumn]: user.id,
      user_name: user.full_name,
      user_email: user.email,
      quiz_score: quizScore,
      quiz_total: quizTotal,
      passed,
      completed_at: new Date().toISOString(),
    },
    { onConflict: crm === "growth" ? "training_key,training_version,crm_user_id" : "training_key,training_version,leadgen_user_id" }
  );

  if (error) return { error: "Failed to record your training completion. Please try again." };

  revalidatePath("/admin/crm/training");
  revalidatePath("/agent/training");
  revalidatePath("/leadgen/admin/training");
  revalidatePath("/leadgen/agent/training");
  return {};
}
