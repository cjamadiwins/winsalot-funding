"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function agentLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedRedirect = String(formData.get("redirectTo") ?? "/agent/dashboard");
  const redirectTo = requestedRedirect.startsWith("/agent") ? requestedRedirect : "/agent/dashboard";

  if (!email || !password) {
    redirect(`/agent/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !data.user) {
    redirect(`/agent/login?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("id")
    .eq("id", data.user.id)
    .eq("active", true)
    .maybeSingle();

  if (!crmUser) {
    await supabase.auth.signOut();
    redirect(
      `/agent/login?error=${encodeURIComponent(
        "This account is not set up for the CRM. Ask an admin to add you as an agent."
      )}`
    );
  }

  redirect(redirectTo);
}
