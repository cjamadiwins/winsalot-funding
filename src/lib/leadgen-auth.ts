import "server-only";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-server";
import type { LeadgenClientRow, LeadgenUserRow } from "./leadgen-types";

const FORCE_DEACTIVATED_LEADGEN_EMAIL = "test-agent@winsalotcorp.com";

// Session + role gates for the Lead Generation CRM. Deliberately its own
// file, not an extension of src/lib/crm-auth.ts - this CRM has a
// completely different role model (admin/agent/client vs the cleaning
// CRM's admin/agent) and must never be able to grant access based on a
// crm_users row or vice versa.
//
// Reads through the session-scoped Supabase client (anon key + user
// JWT), same as crm-auth.ts, so this doubles as a live check that RLS
// still sees this user as an active leadgen_users member.

export async function requireLeadgenUser(): Promise<LeadgenUserRow> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/leadgen/login");
  }

  if ((authData.user.email ?? "").trim().toLowerCase() === FORCE_DEACTIVATED_LEADGEN_EMAIL) {
    await supabase.auth.signOut();
    redirect(`/leadgen/login?error=${encodeURIComponent("Your account has been deactivated. Please contact the administrator.")}`);
  }

  const { data: leadgenUser } = await supabase
    .from("leadgen_users")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!leadgenUser) {
    redirect("/leadgen/login?error=Your account is not set up for the Lead Generation CRM yet.");
  }

  if (!leadgenUser.active) {
    await supabase.auth.signOut();
    // A disabled *client* login gets the Client Portal's own wording and
    // is bounced back to /client (not /leadgen/login) - both the exact
    // message and destination the brief specifies for "Disable Portal
    // Access" ("The client should see a professional message..."). Admin/
    // agent deactivation is unchanged.
    if (leadgenUser.role === "client") {
      redirect(
        `/client?error=${encodeURIComponent(
          "Your Winsalot Client Portal access is currently inactive. Please contact Winsalot Corp if you believe this is an error."
        )}`
      );
    }
    redirect(`/leadgen/login?error=${encodeURIComponent("Your account has been deactivated. Please contact the administrator.")}`);
  }

  return leadgenUser as LeadgenUserRow;
}

export async function requireLeadgenAdmin(): Promise<LeadgenUserRow> {
  const user = await requireLeadgenUser();
  if (user.role !== "admin") {
    redirect("/leadgen/login?error=This account does not have administrator access.");
  }
  return user;
}

export async function requireLeadgenAgent(): Promise<LeadgenUserRow> {
  const user = await requireLeadgenUser();
  if (user.role !== "agent") {
    redirect("/leadgen/login?error=This account is not an agent account.");
  }
  return user;
}

// Gates a client workspace route (/leadgen/client/[slug]/...) - the
// signed-in user must be a client-role leadgen_users row whose client_id
// matches the client identified by this exact slug. A client attempting
// to open a different client's slug in the URL bar gets notFound()
// (not a redirect back to their own workspace) so the URL itself never
// confirms or denies whether a given slug exists to someone who
// shouldn't be looking.
export async function requireLeadgenClient(slug: string): Promise<{ user: LeadgenUserRow; client: LeadgenClientRow }> {
  const user = await requireLeadgenUser();
  if (user.role !== "client" || !user.client_id) {
    redirect("/leadgen/login?error=This account is not a client account.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase
    .from("leadgen_clients")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!client || client.id !== user.client_id) {
    notFound();
  }

  return { user, client: client as LeadgenClientRow };
}

// Gates the canonical, slug-free Client Portal at /client/... (the
// brief's "MAIN CLIENT PORTAL LOCATION"). Identity comes entirely from
// the signed-in session's own client_id - there is no slug or id in the
// URL at all for a client login to tamper with, closing off the IDOR
// surface a URL-embedded identifier would otherwise create. The old
// /leadgen/client/[slug]/... routes still exist as thin redirects into
// this one (see that directory) so a stale bookmark/email link keeps
// working.
export async function requireLeadgenPortalClient(): Promise<{ user: LeadgenUserRow; client: LeadgenClientRow }> {
  const user = await requireLeadgenUser();
  if (user.role !== "client" || !user.client_id) {
    redirect("/client?error=This account is not a client account.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase.from("leadgen_clients").select("*").eq("id", user.client_id).maybeSingle();

  if (!client) {
    redirect("/client?error=Your client account could not be found. Please contact Winsalot Corp.");
  }

  return { user, client: client as LeadgenClientRow };
}
