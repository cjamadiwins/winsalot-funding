import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./fetch-all-rows";
import type { AgentSalesBonusRow, SalesBonusProgramRow, SalesBonusRow } from "./sales-bonus";

// Both loaders run through the caller's session client, so RLS decides what
// comes back: every bonus for an Admin of either CRM, nothing for anyone else.
export async function loadSalesBonuses(db: SupabaseClient): Promise<{ data: SalesBonusRow[]; error: { message: string } | null }> {
  return fetchAllRows<SalesBonusRow>((from, to) =>
    db.from("winsalot_sales_conversion_bonuses").select("*").order("sale_confirmed_at", { ascending: false }).order("id").range(from, to)
  );
}

export async function loadSalesBonusPrograms(db: SupabaseClient): Promise<SalesBonusProgramRow[]> {
  const { data } = await db.from("winsalot_sales_bonus_programs").select("*").eq("active", true);
  return (data ?? []) as SalesBonusProgramRow[];
}

// An agent's own earned bonuses (no client billing fields) - the database
// function scopes this to auth.uid() itself, so there is no id to pass.
export async function loadMySalesBonuses(db: SupabaseClient): Promise<{ data: AgentSalesBonusRow[]; error: { message: string } | null }> {
  const { data, error } = await db.rpc("winsalot_my_sales_bonuses");
  return { data: (data ?? []) as AgentSalesBonusRow[], error };
}
