import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-server";

// Defense in depth: proxy.ts already blocks unauthenticated requests to
// /admin/*, but Next.js Server Functions can be called directly and are
// not guaranteed to pass through every proxy matcher after a refactor, so
// every admin Server Action calls this too. See the "Execution order" /
// Server Functions note in the Next.js proxy docs.
//
// Also blocks CRM agent accounts from this (pre-existing) quote dashboard.
// A row in crm_users with role='agent' is explicitly not an admin; anyone
// else (no crm_users row at all, or role='admin') keeps today's behavior
// of full access - this only ever narrows access for accounts created
// through the new /admin/crm/agents flow, never for existing admins.
export async function requireAdminUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/admin/login");
  }

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (crmUser?.role === "agent") {
    redirect("/admin/login?error=This account does not have access to the quote dashboard.");
  }

  return data.user;
}
