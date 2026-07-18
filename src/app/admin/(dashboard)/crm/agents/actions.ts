"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";

// Creating a Supabase Auth user is inherently a privileged operation (the
// Admin API requires the service-role key), so this is the one place in
// the CRM that uses getSupabaseAdmin() for a write rather than the
// session-scoped client + RLS. Everything else about this agent's access
// (which leads they can see/edit) is still enforced by the crm_leads/
// crm_activities RLS policies from migration 0007, keyed off crm_users.id.
export async function createAgentAction(formData: FormData) {
  await requireCrmAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email || password.length < 8) {
    throw new Error("Name, email, and a password of at least 8 characters are required.");
  }

  const admin = getSupabaseAdmin();
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    throw new Error(authError?.message ?? "Failed to create the agent's login.");
  }

  const { error: crmError } = await admin.from("crm_users").insert({
    id: authUser.user.id,
    full_name: fullName,
    email,
    role: "agent",
    active: true,
  });

  if (crmError) {
    // Roll back the orphaned auth user so a failed agent creation doesn't
    // leave a login with no corresponding crm_users row.
    await admin.auth.admin.deleteUser(authUser.user.id);
    throw new Error("Failed to save the agent record.");
  }

  revalidatePath("/admin/crm/agents");
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
