"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getAuthRedirectBaseUrl } from "@/lib/site-url";
import { fetchActiveAssignedModules, fetchOwnProgressByModuleId } from "@/lib/crm-training-data";
import { isModuleCompletedForUser } from "@/lib/crm-training-types";

// Every action below returns { error } instead of throwing. Next.js
// redacts any error *thrown* from a Server Action in production builds
// down to a generic "An error occurred in the Server Components render"
// message with no detail (by design, to avoid leaking internals) - which
// swallowed our own deliberate messages too (e.g. "You can't remove your
// own account"), not just unexpected failures. Returning the message
// instead sidesteps that redaction entirely, since it's just data crossing
// the client/server boundary, not a thrown error. AgentsClient.tsx reads
// `result.error` off the return value; it still wraps the call in a
// try/catch as a fallback for anything that throws unexpectedly.
type ActionResult = { error?: string };

// The only way an agent account gets created: the admin supplies a name +
// email, never a password. Supabase emails the invite link itself (the
// Admin API requires the service-role key, so this is the one place in
// the CRM that uses getSupabaseAdmin() for a write rather than the
// session-scoped client + RLS); the agent sets their own password at
// /agent/set-password. There is no public sign-up route anywhere in this
// app, so this invite is the only path into an agent account. Every
// invited account gets role='agent' - promotion to admin, if ever needed,
// is a separate, deliberate edit in updateAgentAction below.
export async function inviteAgentAction(formData: FormData): Promise<ActionResult> {
  await requireCrmAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!fullName || !email) {
    return { error: "Name and email are required." };
  }

  const admin = getSupabaseAdmin();
  const { data: authUser, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getAuthRedirectBaseUrl()}/agent/set-password`,
    data: { full_name: fullName },
  });

  if (authError || !authUser.user) {
    return { error: authError?.message ?? "Failed to invite this agent." };
  }

  const { error: crmError } = await admin.from("crm_users").insert({
    id: authUser.user.id,
    full_name: fullName,
    email,
    role: "agent",
    active: true,
  });

  if (crmError) {
    // Roll back the orphaned auth user so a failed invite doesn't leave a
    // login with no corresponding crm_users row.
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { error: "Failed to save the agent record." };
  }

  const { error: onboardingError } = await admin.from("crm_agent_onboarding").insert({
    agent_id: authUser.user.id,
    status: "invited",
  });

  if (onboardingError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { error: "Failed to create the agent onboarding record." };
  }

  revalidatePath("/admin/crm/agents");
  return {};
}

export async function reviewAgentOnboardingAction(
  agentId: string,
  decision: "approved" | "changes_requested",
  note = ""
): Promise<ActionResult> {
  const currentAdmin = await requireCrmAdmin();
  if (decision === "changes_requested" && !note.trim()) {
    return { error: "Add a note explaining what the agent needs to update." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: record } = await supabase
    .from("crm_agent_onboarding")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!record) return { error: "This agent does not have an onboarding record." };
  if (record.status !== "submitted") return { error: "The agent must submit onboarding before review." };

  if (decision === "approved") {
    const [modulesResult, progressResult] = await Promise.all([
      fetchActiveAssignedModules(supabase),
      fetchOwnProgressByModuleId(supabase, agentId),
    ]);
    const incomplete = modulesResult.data.filter((module) =>
      module.is_required && !isModuleCompletedForUser(module, progressResult.data.get(module.id))
    );
    const recordComplete = record.phone && record.emergency_contact_name &&
      record.emergency_contact_phone && record.policies_acknowledged_at &&
      record.attendance_acknowledged_at && record.confidentiality_acknowledged_at &&
      record.quiz_passed_at && record.acknowledgement_at;
    if (!recordComplete || incomplete.length > 0) {
      return { error: "This onboarding record is not complete and cannot be approved." };
    }
  }

  const { error } = await supabase
    .from("crm_agent_onboarding")
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentAdmin.id,
      review_note: note.trim() || null,
    })
    .eq("agent_id", agentId);
  if (error) return { error: "Failed to save the onboarding decision." };

  revalidatePath("/admin/crm/agents");
  revalidatePath("/agent/onboarding");
  return {};
}

export async function resendAgentAccessEmailAction(agentId: string): Promise<ActionResult> {
  await requireCrmAdmin();

  const admin = getSupabaseAdmin();
  const { data: agent, error: agentError } = await admin
    .from("crm_users")
    .select("email, role, active")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError || !agent || agent.role !== "agent") {
    return { error: "Agent account not found." };
  }
  if (!agent.active) {
    return { error: "Reactivate this agent before resending access." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(agent.email, {
    redirectTo: `${getAuthRedirectBaseUrl()}/agent/set-password`,
  });

  if (error) {
    return { error: error.message || "Failed to resend the access email." };
  }

  return {};
}

// Hard-removes an agent's login entirely. crm_users.id references
// auth.users(id) on delete cascade, so the crm_users row goes with it;
// crm_leads/crm_activities only reference crm_users with on delete set
// null, so the agent's lead and activity history is preserved, just
// unassigned - nothing about past work is destroyed.
export async function removeAgentAction(agentId: string): Promise<ActionResult> {
  const currentAdmin = await requireCrmAdmin();

  if (agentId === currentAdmin.id) {
    return { error: "You can't remove your own account." };
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(agentId);

  if (error) return { error: "Failed to remove this agent." };

  revalidatePath("/admin/crm/agents");
  revalidatePath("/admin/crm");
  return {};
}

export async function updateAgentAction(
  agentId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireCrmAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const active = formData.get("active") === "on";

  if (!fullName) return { error: "Name is required." };
  if (role !== "admin" && role !== "agent") return { error: "Invalid role." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_users")
    .update({ full_name: fullName, role, active })
    .eq("id", agentId);

  if (error) return { error: "Failed to update the agent." };

  revalidatePath("/admin/crm/agents");
  return {};
}
