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

  if (!crmUser || crmUser.role !== "admin") {
    redirect("/admin");
  }

  return crmUser as CrmUserRow;
}
