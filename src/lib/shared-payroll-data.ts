import "server-only";
import type { createSupabaseServerClient } from "./supabase-server";

// Read all pages through the caller's session/RLS. Historical records must
// remain retrievable beyond PostgREST's default response row limit.
export async function loadSharedPayrollData(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: "winsalot_payroll" | "winsalot_payroll_audit_log" | "winsalot_payroll_agents",
  columns = "*",
  agentId?: string,
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  const rows: unknown[] = [];
  const pageSize = 500;
  const order = table === "winsalot_payroll" ? "payday" : table === "winsalot_payroll_agents" ? "full_name" : "created_at";
  for (let offset = 0; ; offset += pageSize) {
    let query = db.from(table).select(columns).order(order, { ascending: table === "winsalot_payroll_agents" }).order("id");
    if (agentId) query = query.eq("agent_id", agentId);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}
