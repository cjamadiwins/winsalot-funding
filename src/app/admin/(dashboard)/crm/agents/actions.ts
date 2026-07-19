"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getAuthRedirectBaseUrl } from "@/lib/site-url";

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

  revalidatePath("/admin/crm/agents");
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
