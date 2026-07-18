import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmFollowUpWithLead, CrmLeadRow, CrmUserRow } from "@/lib/crm-types";
import AdminCrmClient from "./AdminCrmClient";
import AdminFollowUps from "./AdminFollowUps";

export default async function AdminCrmPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_leads_admin_all / crm_users_admin_select_all /
  // crm_followups_admin_all) permits a full read here because this page
  // is already gated by requireCrmAdmin().
  const [
    { data: leads, error: leadsError },
    { data: agents, error: agentsError },
    { data: followUps, error: followUpsError },
  ] = await Promise.all([
    supabase.from("crm_leads").select("*").order("created_at", { ascending: false }),
    supabase.from("crm_users").select("*").order("full_name"),
    supabase
      .from("crm_followups")
      .select("*, crm_leads(id, business_name, phone, city, assigned_agent_id)")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">CRM</h1>
      <p className="mt-1 text-sm text-slate-500">
        Leads, follow-ups, and quote progress across every agent.
      </p>

      {(leadsError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load CRM data: {(leadsError ?? agentsError)?.message}
        </p>
      )}

      {!leadsError && !agentsError && (
        <div className="mt-6">
          <AdminCrmClient
            leads={(leads ?? []) as CrmLeadRow[]}
            agents={(agents ?? []) as CrmUserRow[]}
          />
        </div>
      )}

      <h2 className="mt-10 text-lg font-bold text-slate-900">All Agents&apos; Follow-Ups</h2>
      {followUpsError ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load follow-ups: {followUpsError.message}
        </p>
      ) : (
        <div className="mt-3">
          <AdminFollowUps
            followUps={(followUps ?? []) as CrmFollowUpWithLead[]}
            agents={(agents ?? []) as CrmUserRow[]}
          />
        </div>
      )}
    </div>
  );
}
