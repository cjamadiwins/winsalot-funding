import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";

// Password setup/reset is permitted only for a dedicated client identity.
// A Supabase Auth identity that is also an active Growth CRM or Lead Gen
// admin/agent must never have its password changed through /client.
export async function isDedicatedClientAuthIdentity(authUserId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const [{ data: growthStaff }, { data: leadgenStaff }, { data: clientUser }] = await Promise.all([
    admin.from("crm_users").select("id").eq("id", authUserId).eq("active", true).in("role", ["admin", "agent"]).maybeSingle(),
    admin.from("leadgen_users").select("id").eq("id", authUserId).eq("active", true).in("role", ["admin", "agent"]).maybeSingle(),
    admin.from("leadgen_users").select("id, client_id").eq("id", authUserId).eq("role", "client").maybeSingle(),
  ]);

  return Boolean(clientUser?.client_id) && !growthStaff && !leadgenStaff;
}
