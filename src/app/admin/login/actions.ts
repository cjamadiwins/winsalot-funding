"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type AdminLoginState = {
  error: string | null;
};

// Root-cause fix for the reported "signs into the wrong CRM/account" bug:
// this used to accept any valid Supabase Auth credential and redirect
// straight into /admin, with no check that the account actually belongs
// to the Growth CRM. Since Supabase Auth is one project shared by both
// CRMs, a Lead Gen CRM-only account's own valid password would "work"
// here too - not because of a security hole (each CRM's data stays
// behind its own RLS/role checks), but because it landed the user in a
// dashboard shell that then had nothing for them, which is exactly the
// "wrong account" / redirect-loop reports. Mirrors the same active-row
// check src/app/agent/login/actions.ts and src/app/leadgen/login/actions.ts
// already use for their own CRM.
export async function loginAction(
  _previousState: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  // Passwords are exact values. Trimming here can make a valid password
  // impossible to use when it intentionally begins or ends with whitespace.
  const password = String(formData.get("password") ?? "");
  const requestedRedirect = String(formData.get("redirectTo") ?? "/admin");
  const redirectTo = requestedRedirect.startsWith("/admin") ? requestedRedirect : "/admin";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return { error: "Invalid email or password." };
    }

    const { data: crmUser, error: crmUserError } = await supabase
      .from("crm_users")
      .select("role, active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (crmUserError) {
      await supabase.auth.signOut();
      return { error: "We could not verify your Growth CRM access. Please try again." };
    }

    if (!crmUser || !crmUser.active || crmUser.role !== "admin") {
      await supabase.auth.signOut();
      return {
        error:
          crmUser?.role === "agent"
            ? "This account does not have admin access. Use the agent sign-in instead."
            : "This account is not set up for Growth CRM admin access.",
      };
    }
  } catch {
    return { error: "The sign-in service is temporarily unavailable. Please try again." };
  }

  redirect(redirectTo);
}
