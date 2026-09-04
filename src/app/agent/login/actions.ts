"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logLoginTiming, newLoginAttemptId } from "@/lib/login-timing";

export async function agentLoginAction(formData: FormData) {
  const attemptId = newLoginAttemptId();
  const t0 = Date.now();
  logLoginTiming(attemptId, "agentLoginAction start", t0);

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedRedirect = String(formData.get("redirectTo") ?? "/agent/dashboard");
  const redirectTo = requestedRedirect.startsWith("/agent") ? requestedRedirect : "/agent/dashboard";

  if (!email || !password) {
    logLoginTiming(attemptId, "redirect: missing email/password", t0);
    redirect(`/agent/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = await createSupabaseServerClient();
  logLoginTiming(attemptId, "signInWithPassword start", t0);
  const { error: signInError, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  logLoginTiming(attemptId, "signInWithPassword end", t0);

  if (signInError || !data.user) {
    logLoginTiming(attemptId, "redirect: invalid credentials", t0);
    redirect(`/agent/login?error=${encodeURIComponent("Invalid email or password.")}`);
  }

  logLoginTiming(attemptId, "crm_users lookup start", t0);
  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("id, role")
    .eq("id", data.user.id)
    .eq("active", true)
    .maybeSingle();
  logLoginTiming(attemptId, "crm_users lookup end", t0);

  if (!crmUser) {
    await supabase.auth.signOut();
    logLoginTiming(attemptId, "redirect: not an active agent account", t0);
    redirect(
      `/agent/login?error=${encodeURIComponent(
        "This account is not set up for the CRM. Ask an admin to add you as an agent."
      )}`
    );
  }

  // Subcontractors have their own, more restricted portal - never let a
  // subcontractor login fall through to full /agent/* access, which has
  // no role check of its own beyond "an active crm_users row" (see
  // requireCrmUser in crm-auth.ts). Redirecting here, not silently
  // continuing, is the fix for that gap - admin/agent accounts are
  // otherwise unaffected, both keep signing in here exactly as before.
  if (crmUser.role === "subcontractor") {
    logLoginTiming(attemptId, "redirect: subcontractor account uses its own portal", t0);
    redirect("/subcontractor/login");
  }

  logLoginTiming(attemptId, "crm_agent_onboarding lookup start", t0);
  const { data: onboarding } = await supabase
    .from("crm_agent_onboarding")
    .select("status")
    .eq("agent_id", data.user.id)
    .maybeSingle();
  logLoginTiming(attemptId, "crm_agent_onboarding lookup end", t0);

  if (onboarding && onboarding.status !== "approved") {
    logLoginTiming(attemptId, "redirect: onboarding pending", t0);
    redirect("/agent/onboarding");
  }

  logLoginTiming(attemptId, "redirect start", t0);
  redirect(redirectTo);
}
