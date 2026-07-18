"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getAuthRedirectBaseUrl } from "@/lib/site-url";

// The only way an agent account gets created: the admin supplies a name +
// email, never a password. Supabase emails the invite link itself (the
// Admin API requires the service-role key, so this is the one place in
// the CRM that uses getSupabaseAdmin() for a write rather than the
// session-scoped client + RLS); the agent sets their own password at
// /agent/set-password. There is no public sign-up route anywhere in this
// app, so this invite is the only path into an agent account. Every
// invited account gets role='agent' - promotion to admin, if ever needed,
// is a separate, deliberate edit in updateAgentAction below.
export async function inviteAgentAction(formData: FormData) {
  await requireCrmAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!fullName || !email) {
    throw new Error("Name and email are required.");
  }

  const admin = getSupabaseAdmin();
  const { data: authUser, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getAuthRedirectBaseUrl()}/agent/set-password`,
    data: { full_name: fullName },
  });

  if (authError || !authUser.user) {
    throw new Error(authError?.message ?? "Failed to invite this agent.");
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
    throw new Error("Failed to save the agent record.");
  }

  revalidatePath("/admin/crm/agents");
}

// Hard-removes an agent's login entirely. crm_users.id references
// auth.users(id) on delete cascade, so the crm_users row goes with it;
// crm_leads/crm_activities only reference crm_users with on delete set
// null, so the agent's lead and activity history is preserved, just
// unassigned - nothing about past work is destroyed.
export async function removeAgentAction(agentId: string) {
  await requireCrmAdmin();

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(agentId);

  if (error) throw new Error("Failed to remove this agent.");

  revalidatePath("/admin/crm/agents");
  revalidatePath("/admin/crm");
}

export async function updateAgentAction(agentId: string, formData: FormData) {
  await requireCrmAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const active = formData.get("active") === "on";

  if (!fullName) throw new Error("Name is required.");
  if (role !== "admin" && role !== "agent") throw new Error("Invalid role.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_users")
    .update({ full_name: fullName, role, active })
    .eq("id", agentId);

  if (error) throw new Error("Failed to update the agent.");

  revalidatePath("/admin/crm/agents");
}
