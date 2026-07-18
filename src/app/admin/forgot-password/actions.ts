"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAuthRedirectBaseUrl } from "@/lib/site-url";

// Always redirects the same way regardless of whether the email exists or
// the Supabase call succeeds — never reveals which emails have accounts.
// Mirrors requestAgentPasswordResetAction (src/app/agent/forgot-password/
// actions.ts), just pointed at the admin set-password page.
export async function requestAdminPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (email) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAuthRedirectBaseUrl()}/admin/set-password`,
    });
  }

  redirect("/admin/forgot-password?sent=1");
}
