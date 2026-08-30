import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmClientPortalActivityRow, PortalLeadgenUserSummary } from "./client-portal-shared";

// Every read in this file that touches leadgen_* tables uses the
// service-role client deliberately, never the caller's session client -
// a Growth CRM admin session (crm_users) has no leadgen_user_role() of
// its own, so leadgen_clients/leadgen_users' own RLS policies would
// return zero rows for it even though the admin is fully authorized to
// manage portal access. Every caller must already have run
// requireCrmAdmin() itself before reaching here - this file performs no
// authorization of its own, exactly like every other admin-only
// service-role helper in this app (see src/lib/supabase-admin.ts).
type LeadgenClientOption = { id: string; name: string; slug: string };

export async function fetchUnlinkedLeadgenClients(currentlyLinkedId: string | null): Promise<LeadgenClientOption[]> {
  const admin = getSupabaseAdmin();
  const { data: allClients } = await admin.from("leadgen_clients").select("id, name, slug").order("name");
  const { data: linkedRows } = await admin.from("crm_clients").select("leadgen_client_id").not("leadgen_client_id", "is", null);

  const linkedIds = new Set((linkedRows ?? []).map((r) => r.leadgen_client_id as string));
  return ((allClients ?? []) as LeadgenClientOption[]).filter((c) => c.id === currentlyLinkedId || !linkedIds.has(c.id));
}

export async function fetchLeadgenClientById(id: string): Promise<{ id: string; name: string; slug: string } | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("leadgen_clients").select("id, name, slug").eq("id", id).maybeSingle();
  return data ?? null;
}

// The client-role leadgen_users login for a given Lead Gen CRM client, if
// one has been created yet. Assumes (as the Growth CRM's Client Portal
// Access panel does throughout) exactly one portal login per client -
// the newest is used as a defensive tie-breaker if more than one somehow
// exists, rather than erroring.
export async function fetchPortalUserForLeadgenClient(leadgenClientId: string): Promise<PortalLeadgenUserSummary | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("leadgen_users")
    .select("id, full_name, email, active, created_at, invited_at, activated_at, deactivated_at, last_login_at")
    .eq("client_id", leadgenClientId)
    .eq("role", "client")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PortalLeadgenUserSummary | null) ?? null;
}

export async function fetchPortalActivity(
  supabase: SupabaseClient,
  crmClientId: string
): Promise<CrmClientPortalActivityRow[]> {
  const { data } = await supabase
    .from("crm_client_portal_activity")
    .select("*")
    .eq("client_id", crmClientId)
    .order("created_at", { ascending: false });
  return (data ?? []) as CrmClientPortalActivityRow[];
}

// Checks an email against Supabase Auth via the admin API (listUsers has
// no exact-match filter in every supabase-js version, so this pages
// through and compares case-insensitively - acceptable here since it
// only ever runs once, from an admin-only Server Action, not a hot path).
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 25; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === normalized);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}
