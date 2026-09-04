"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function completeSubcontractorSetupAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");
  if (password.length < 12) redirect(`/subcontractor/setup?error=${encodeURIComponent("Use at least 12 characters for your password.")}`);
  if (password !== confirmation) redirect(`/subcontractor/setup?error=${encodeURIComponent("The passwords do not match.")}`);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/subcontractor?error=${encodeURIComponent("Your setup link has expired.")}`);
  const { data: profile } = await supabase.from("crm_subcontractors").select("id").eq("auth_user_id", data.user.id).eq("active", true).eq("portal_active", true).maybeSingle();
  if (!profile) { await supabase.auth.signOut(); redirect("/subcontractor?error=This account is not active."); }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/subcontractor/setup?error=${encodeURIComponent(error.message)}`);
  redirect("/subcontractor/dashboard");
}
