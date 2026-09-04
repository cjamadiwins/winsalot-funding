"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendSubcontractorPortalEmail } from "@/lib/subcontractor-portal-email";

export async function subcontractorLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect(`/subcontractor?error=${encodeURIComponent("Email and password are required.")}`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(`/subcontractor?error=${encodeURIComponent("Invalid email or password.")}`);
  const { data: subcontractor } = await supabase.from("crm_subcontractors").select("id").eq("auth_user_id", data.user.id).eq("active", true).eq("portal_active", true).maybeSingle();
  if (!subcontractor) {
    await supabase.auth.signOut();
    redirect(`/subcontractor?error=${encodeURIComponent("This login is not active for the Winsalot Subcontractor Portal.")}`);
  }
  await getSupabaseAdmin().from("crm_subcontractors").update({ last_login_at: new Date().toISOString() }).eq("id", subcontractor.id);
  redirect("/subcontractor/dashboard");
}

export async function requestSubcontractorResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const message = "If that email belongs to an active subcontractor portal, a password reset link has been sent.";
  if (email) {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from("crm_subcontractors").select("full_name, email, auth_user_id, active, portal_active").ilike("email", email).maybeSingle();
    if (data?.auth_user_id && data.active && data.portal_active) {
      await sendSubcontractorPortalEmail({ kind: "reset", email: data.email, fullName: data.full_name });
    }
  }
  redirect(`/subcontractor/reset-password?message=${encodeURIComponent(message)}`);
}
