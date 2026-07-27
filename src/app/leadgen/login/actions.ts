"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function leadgenLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/leadgen/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError, data } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !data.user) {
    redirect(`/leadgen/login?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  const { data: leadgenUser } = await supabase
    .from("leadgen_users")
    .select("id")
    .eq("id", data.user.id)
    .eq("active", true)
    .maybeSingle();

  if (!leadgenUser) {
    await supabase.auth.signOut();
    redirect(
      `/leadgen/login?error=${encodeURIComponent(
        "This account is not set up for the Lead Generation CRM. Ask an admin to add you."
      )}`
    );
  }

  // /leadgen itself is the role router - it sends admin/agent/client to
  // the right home, so this action never needs to know the role.
  redirect("/leadgen");
}
