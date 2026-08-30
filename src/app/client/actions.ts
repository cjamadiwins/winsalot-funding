"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Client Portal sign-in - deliberately its own action, not a reuse of
// /leadgen/login's leadgenLoginAction, since that shared action treats
// every role identically (redirect("/leadgen") and let the role router
// dispatch). This one is Client Portal-specific: it verifies the account
// is actually a *client* role (never lets an admin/agent login "work" at
// /client and land somewhere they shouldn't) and gives the exact
// disabled-access wording the brief specifies at the moment of sign-in,
// not just on a later request.
export async function clientLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/client?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError, data } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !data.user) {
    redirect(`/client?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  const { data: leadgenUser } = await supabase
    .from("leadgen_users")
    .select("id, role, active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!leadgenUser || leadgenUser.role !== "client") {
    await supabase.auth.signOut();
    redirect(`/client?error=${encodeURIComponent("This login is for Winsalot clients only.")}`);
  }

  if (!leadgenUser.active) {
    await supabase.auth.signOut();
    redirect(
      `/client?error=${encodeURIComponent(
        "Your Winsalot Client Portal access is currently inactive. Please contact Winsalot Corp if you believe this is an error."
      )}`
    );
  }

  // Service-role update, not the session client - leadgen_users has no
  // RLS policy letting a client row update itself (only admin_all and
  // select_self exist), and this must never be something a client's own
  // authenticated request could otherwise write arbitrary columns
  // through. Scoped to exactly this just-verified id.
  await getSupabaseAdmin()
    .from("leadgen_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", data.user.id);

  redirect("/client/dashboard");
}
