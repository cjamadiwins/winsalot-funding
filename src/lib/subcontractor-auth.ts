import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-server";
import type { SubcontractorRow } from "./subcontractor-payroll";

export async function requireGrowthSubcontractor(): Promise<SubcontractorRow> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/subcontractor");

  const { data } = await supabase
    .from("crm_subcontractors")
    .select("*")
    .eq("auth_user_id", authData.user.id)
    .eq("active", true)
    .eq("portal_active", true)
    .maybeSingle();

  if (!data) {
    await supabase.auth.signOut();
    redirect(`/subcontractor?error=${encodeURIComponent("Your subcontractor portal access is inactive. Please contact Winsalot Corp.")}`);
  }
  return data as SubcontractorRow;
}
