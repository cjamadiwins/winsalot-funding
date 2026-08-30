"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendPortalEmail } from "@/lib/client-portal-emails";

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

  await getSupabaseAdmin()
    .from("leadgen_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", data.user.id);

  redirect("/client/dashboard");
}

// Public forgot-password action. It intentionally returns the same success
// message whether or not the email is a valid, active client portal login,
// preventing account enumeration. Supabase's service-role key and raw Auth
// URLs stay server-side; sendPortalEmail emits only a Winsalot URL.
export async function requestClientPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const genericMessage = "If that email belongs to an active Winsalot Client Portal, a password reset link has been sent.";

  if (!email) {
    redirect(`/client/reset-password?message=${encodeURIComponent(genericMessage)}`);
  }

  const admin = getSupabaseAdmin();
  const { data: portalUser } = await admin
    .from("leadgen_users")
    .select("id, full_name, email, active, client_id")
    .eq("email", email)
    .eq("role", "client")
    .maybeSingle();

  if (portalUser?.active && portalUser.client_id) {
    const { data: client } = await admin
      .from("leadgen_clients")
      .select("id, name")
      .eq("id", portalUser.client_id)
      .maybeSingle();

    if (client) {
      await sendPortalEmail({
        kind: "reset",
        leadgenClientId: client.id,
        clientName: client.name,
        toEmail: portalUser.email,
        toName: portalUser.full_name,
      });
    }
  }

  redirect(`/client/reset-password?message=${encodeURIComponent(genericMessage)}`);
}
