"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAuthRedirectBaseUrl } from "@/lib/site-url";

// Always redirects the same way regardless of whether the email exists or
// the Supabase call succeeds — never reveals which emails have accounts.
export async function requestAgentPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (email) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAuthRedirectBaseUrl()}/agent/set-password`,
    });
  }

  redirect("/agent/forgot-password?sent=1");
}
