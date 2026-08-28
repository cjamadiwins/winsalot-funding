"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmOnboardingUser } from "@/lib/crm-auth";
import { fetchActiveAssignedModules, fetchOwnProgressByModuleId } from "@/lib/crm-training-data";
import { isModuleCompletedForUser } from "@/lib/crm-training-types";

type ActionResult = { error?: string; message?: string };

export async function saveOnboardingProfileAction(formData: FormData): Promise<ActionResult> {
  const user = await requireCrmOnboardingUser();
  const phone = String(formData.get("phone") ?? "").trim();
  const emergencyContactName = String(formData.get("emergency_contact_name") ?? "").trim();
  const emergencyContactPhone = String(formData.get("emergency_contact_phone") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Toronto").trim();
  if (!phone || !emergencyContactName || !emergencyContactPhone || !timezone) {
    return { error: "Complete every profile field before saving." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_agent_onboarding").update({
    phone,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    timezone,
    status: "in_progress",
  }).eq("agent_id", user.id);
  if (error) return { error: "We could not save your profile." };
  revalidatePath("/agent/onboarding");
  return { message: "Profile saved." };
}

export async function acknowledgePoliciesAction(formData: FormData): Promise<ActionResult> {
  const user = await requireCrmOnboardingUser();
  if (["policies", "attendance", "confidentiality"].some((name) => formData.get(name) !== "on")) {
    return { error: "Confirm all three acknowledgements." };
  }
  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_agent_onboarding").update({
    policies_acknowledged_at: now,
    attendance_acknowledged_at: now,
    confidentiality_acknowledged_at: now,
    status: "in_progress",
  }).eq("agent_id", user.id);
  if (error) return { error: "We could not save your acknowledgements." };
  revalidatePath("/agent/onboarding");
  return { message: "Acknowledgements saved." };
}

export async function completeOnboardingModuleAction(moduleId: string): Promise<ActionResult> {
  const user = await requireCrmOnboardingUser();
  const supabase = await createSupabaseServerClient();
  const { data: module } = await supabase.from("crm_training_modules")
    .select("id, current_version, is_active").eq("id", moduleId).eq("is_active", true).maybeSingle();
  if (!module) return { error: "Training module not found." };
  const now = new Date().toISOString();
  const { error } = await supabase.from("crm_training_progress").upsert({
    user_id: user.id,
    module_id: module.id,
    module_version: module.current_version,
    opened_at: now,
    completed_at: now,
  }, { onConflict: "user_id,module_id,module_version" });
  if (error) return { error: "We could not record this module." };
  revalidatePath("/agent/onboarding");
  return { message: "Training module completed." };
}

export async function submitOnboardingQuizAction(formData: FormData): Promise<ActionResult> {
  const user = await requireCrmOnboardingUser();
  const answers = ["q1", "q2", "q3", "q4", "q5"].map((key) => String(formData.get(key) ?? ""));
  const correct = ["business_name", "crm", "professional", "follow_schedule", "protect_data"];
  const score = answers.reduce((total, answer, index) => total + (answer === correct[index] ? 20 : 0), 0);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_agent_onboarding").update({
    quiz_score: score,
    quiz_passed_at: score >= 80 ? new Date().toISOString() : null,
    status: "in_progress",
  }).eq("agent_id", user.id);
  if (error) return { error: "We could not save your quiz." };
  revalidatePath("/agent/onboarding");
  return score >= 80
    ? { message: `Quiz passed with ${score}%.` }
    : { error: `You scored ${score}%. Review the training and try again; 80% is required.` };
}

export async function signAndSubmitOnboardingAction(formData: FormData): Promise<ActionResult> {
  const user = await requireCrmOnboardingUser();
  const signature = String(formData.get("acknowledgement_name") ?? "").trim();
  if (!signature || signature.toLowerCase() !== user.full_name.trim().toLowerCase()) {
    return { error: "Type your full name exactly as shown on your account." };
  }
  const supabase = await createSupabaseServerClient();
  const [{ data: record }, modulesResult, progressResult] = await Promise.all([
    supabase.from("crm_agent_onboarding").select("*").eq("agent_id", user.id).single(),
    fetchActiveAssignedModules(supabase),
    fetchOwnProgressByModuleId(supabase, user.id),
  ]);
  if (!record) return { error: "Onboarding record not found." };
  if (!record.phone || !record.emergency_contact_name || !record.emergency_contact_phone) return { error: "Complete your profile first." };
  if (!record.policies_acknowledged_at || !record.attendance_acknowledged_at || !record.confidentiality_acknowledged_at) return { error: "Complete all acknowledgements first." };
  if (!record.quiz_passed_at) return { error: "Pass the knowledge quiz first." };
  const incomplete = modulesResult.data.filter((m) => m.is_required && !isModuleCompletedForUser(m, progressResult.data.get(m.id)));
  if (incomplete.length) return { error: `Complete all required training modules (${incomplete.length} remaining).` };
  const now = new Date().toISOString();
  const { error } = await supabase.from("crm_agent_onboarding").update({
    acknowledgement_name: signature,
    acknowledgement_at: now,
    submitted_at: now,
    status: "submitted",
    review_note: null,
  }).eq("agent_id", user.id);
  if (error) return { error: "We could not submit your onboarding." };
  revalidatePath("/agent/onboarding");
  revalidatePath("/admin/crm/agents");
  return { message: "Onboarding submitted for admin review." };
}

