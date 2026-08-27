import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-server";

// Defense in depth: proxy.ts already blocks unauthenticated requests to
// /admin/*, but Next.js Server Functions can be called directly and are
// not guaranteed to pass through every proxy matcher after a refactor, so
// every admin Server Action calls this too. See the "Execution order" /
// Server Functions note in the Next.js proxy docs.
//
// Root-cause fix for the reported "/admin redirect loop" bug: this used
// to let a signed-in Supabase Auth user through whenever their crm_users
// row was simply missing (comment used to say "no crm_users row at all...
// keeps today's behavior of full access", from when a pre-CRM /admin
// account with its own dashboard page existed). That page is gone -
// AdminRootPage (src/app/admin/(dashboard)/page.tsx) now unconditionally
// redirects "/admin" -> "/admin/crm", and every real page under /admin
// (starting with /admin/crm itself) requires an *active* crm_users
// admin row via requireCrmAdmin(). A user who reached here with no
// crm_users row - including, since Supabase Auth is one project shared
// by both CRMs, a Lead Gen CRM-only account that happens to sign in
// successfully at /admin/login - therefore bounced forever between
// "/admin" and "/admin/crm" instead of ever reaching a page or an error.
// A deactivated admin (active=false) hit the exact same loop, since this
// function never checked `active` at all.
//
// Requiring an active row here (not just excluding role='agent') closes
// that gap and matches every sibling gate in this app (requireCrmAdmin,
// requireCrmUser for /agent, requireLeadgenUser for /leadgen), all of
// which already require an active row for their own CRM before granting
// entry. A role='agent' account is still just redirected away (not
// signed out) since that's a legitimate account for this same CRM's
// /agent area - only a missing/inactive/wrong-CRM session is fully
// signed out here, so it can't linger as a valid-looking cookie.
export async function requireAdminUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/admin/login");
  }

  // An operator-initiated password reset (see the admin agents/forgot-
  // password flows) sets this flag; every admin Server Action bounces to
  // the set-password page until it's cleared, mirroring the proxy.ts
  // check for requests that reach here directly.
  if (data.user.user_metadata?.must_change_password) {
    redirect("/admin/set-password");
  }

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role, active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (crmUser?.role === "agent") {
    redirect("/admin/login?error=This account does not have access to the quote dashboard.");
  }

  if (!crmUser || !crmUser.active) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=This account is not set up for Growth CRM admin access.");
  }

  return data.user;
}
