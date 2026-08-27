import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-server";
import type { CrmUserRow } from "./crm-types";

// Defense in depth, same rationale as requireAdminUser in admin-auth.ts:
// src/proxy.ts already gates /agent/* on a logged-in Supabase session, but
// every agent-area Server Function re-checks here too, since Server
// Functions aren't guaranteed to pass through every proxy matcher after a
// refactor.
//
// Reads crm_users through the *session* client (anon key + user JWT), not
// the service-role client, so this doubles as a live check that RLS still
// sees this user as an active CRM member - if the row is missing or
// inactive, the select simply returns nothing.
export async function requireCrmUser(): Promise<CrmUserRow> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/agent/login");
  }

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("*")
    .eq("id", authData.user.id)
    .eq("active", true)
    .maybeSingle();

  if (!crmUser) {
    redirect("/agent/login?error=Your account is not set up for the CRM yet.");
  }

  return crmUser as CrmUserRow;
}

// Same as requireCrmUser, but also requires role='admin'. Used to gate
// /admin/crm/* pages in addition to the existing requireAdminUser() check
// on the whole /admin/* area.
//
// Root-cause fix for the reported "/admin redirect loop" bug: this used
// to redirect a failing check back to "/admin" - but "/admin" itself
// (AdminRootPage) unconditionally redirects to "/admin/crm", which calls
// this exact function again. Any signed-in user who could reach this
// point without an active admin row (a deactivated admin, or - since
// Supabase Auth is one project shared by both CRMs - a Lead Gen CRM-only
// account that got past requireAdminUser's own now-fixed gap) bounced
// between "/admin" and "/admin/crm" forever instead of ever landing on a
// real page. Redirecting to "/admin/login" instead breaks that loop for
// good, matching how every sibling gate in this app already behaves
// (requireCrmUser -> /agent/login, requireLeadgenUser -> /leadgen/login).
// A signed-in active agent (a legitimate account for this same CRM, just
// the wrong role for this page) is only redirected, not signed out -
// preserving their own /agent session; anything else observed here (no
// row, inactive, or wrong CRM) is also signed out so it can't linger as
// a valid-looking cookie.
export async function requireCrmAdmin(): Promise<CrmUserRow> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/admin/login");
  }

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("*")
    .eq("id", authData.user.id)
    .eq("active", true)
    .maybeSingle();

  if (crmUser && crmUser.role !== "admin") {
    redirect("/admin/login?error=This account does not have admin access.");
  }

  if (!crmUser) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=This account is not set up for Growth CRM admin access.");
  }

  return crmUser as CrmUserRow;
}
