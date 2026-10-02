import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sortServices, type ClientServiceHistoryRow, type ClientServiceRow } from "./leadgen-client-services";

// Reads for the Products, Services & Pricing feature. The caller decides which
// client to read through: the Admin pages pass the service-role client (after
// requireLeadgenAdmin), the agent pages pass the signed-in agent's own session
// client, so RLS (active entries of assigned clients only) does the isolation.
// A failed read (e.g. the table not existing yet) returns an empty list rather
// than breaking the page it is embedded in.
export async function fetchClientServices(supabase: SupabaseClient, clientId: string, options: { activeOnly?: boolean } = {}): Promise<ClientServiceRow[]> {
  let query = supabase.from("leadgen_client_services").select("*").eq("client_id", clientId);
  if (options.activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) return [];
  return sortServices((data ?? []) as ClientServiceRow[]);
}

// Admin only (the table has no agent/client policy).
export async function fetchClientServiceHistory(admin: SupabaseClient, clientId: string): Promise<{ history: ClientServiceHistoryRow[]; userNames: Record<string, string> }> {
  const { data, error } = await admin
    .from("leadgen_client_service_history")
    .select("id, service_id, change_type, changed_at, changed_by, previous, snapshot")
    .eq("client_id", clientId)
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) return { history: [], userNames: {} };
  const history = (data ?? []) as ClientServiceHistoryRow[];
  const userIds = [...new Set(history.map((h) => h.changed_by).filter((v): v is string => Boolean(v)))];
  const userNames: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await admin.from("leadgen_users").select("id, full_name, email").in("id", userIds);
    for (const user of users ?? []) userNames[user.id as string] = (user.full_name as string) || (user.email as string);
  }
  return { history, userNames };
}

export async function fetchUserNames(admin: SupabaseClient, ids: (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return {};
  const { data } = await admin.from("leadgen_users").select("id, full_name, email").in("id", unique);
  const names: Record<string, string> = {};
  for (const user of data ?? []) names[user.id as string] = (user.full_name as string) || (user.email as string);
  return names;
}
