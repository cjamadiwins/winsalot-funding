"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function subcontractorLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedRedirect = String(formData.get("redirectTo") ?? "/subcontractor/dashboard");
  const redirectTo = requestedRedirect.startsWith("/subcontractor") ? requestedRedirect : "/subcontractor/dashboard";

  if (!email || !password) {
    redirect(`/subcontractor/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError, data } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !data.user) {
    redirect(`/subcontractor/login?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("id, role")
    .eq("id", data.user.id)
    .eq("active", true)
    .maybeSingle();

  if (!crmUser || crmUser.role !== "subcontractor") {
    await supabase.auth.signOut();
    redirect(
      `/subcontractor/login?error=${encodeURIComponent("This account does not have subcontractor access. Ask an admin to grant CRM access.")}`
    );
  }

  redirect(redirectTo);
}
