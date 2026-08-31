"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDedicatedClientAuthIdentity } from "@/lib/client-auth-identity";

export async function completeClientPortalSetupAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (password.length < 12) {
    redirect(`/client/setup?error=${encodeURIComponent("Use at least 12 characters for your password.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/client/setup?error=${encodeURIComponent("The passwords do not match.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    redirect(`/client?error=${encodeURIComponent("Your setup link has expired. Please request a new invitation.")}`);
  }

  const { data: portalUser } = await supabase
    .from("leadgen_users")
    .select("id, role, active, client_id")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!portalUser || portalUser.role !== "client" || !portalUser.client_id) {
    await supabase.auth.signOut();
    redirect(`/client?error=${encodeURIComponent("This account is not a Winsalot client portal account.")}`);
  }

  if (!(await isDedicatedClientAuthIdentity(authData.user.id))) {
    await supabase.auth.signOut();
    redirect(`/client?error=${encodeURIComponent("Staff accounts cannot be changed through the Client Portal. Use a separate client-only email address.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/client/setup?error=${encodeURIComponent(error.message || "Could not save your password.")}`);
  }

  if (!portalUser.active) {
    await supabase.auth.signOut();
    redirect(
      `/client?message=${encodeURIComponent("Your password is set. Your portal will be available after Winsalot activates your access.")}`
    );
  }

  redirect("/client/dashboard");
}
