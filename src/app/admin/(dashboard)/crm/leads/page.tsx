import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmFollowUpWithLead, CrmLeadRow, CrmUserRow } from "@/lib/crm-types";
import AdminCrmClient from "../AdminCrmClient";
import AdminFollowUps from "../AdminFollowUps";
import AdminOverdueLeadsPanel from "../AdminOverdueLeadsPanel";

// Quote Fulfillment - customer leads, their stage pipeline, and
// follow-ups. Moved here (previously the content of /admin/crm itself)
// so /admin/crm can be dedicated to Provider Acquisition only - the
// underlying crm_leads/crm_followups data, RLS, and every workflow
// (stage changes, follow-up scheduling, closing a lead, quote linking)
// are completely unchanged, only the URL this is reached at moved.
// Every server action that used to revalidate "/admin/crm" for this
// data now also revalidates "/admin/crm/leads" (see followup-actions.ts,
// crm/leads/[id]/actions.ts, crm/agents/actions.ts).
export default async function AdminCrmLeadsPage() {
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
      // crm_followups also holds opportunity- and provider-lead-targeted
      // rows (migrations 0013/0026) - this page's lead follow-ups are
      // lead-only, so exclude those explicitly rather than relying on RLS
      // alone (which permits all three target types).
      .not("lead_id", "is", null)
      .order("scheduled_at", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Quote Fulfillment</h1>
      <p className="mt-1 text-sm text-slate-500">
        Customer leads, follow-ups, and quote progress across every agent - from initial request through to a
        completed or closed job.
      </p>

      {(leadsError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load CRM data: {(leadsError ?? agentsError)?.message}
        </p>
      )}

      {!leadsError && !agentsError && !followUpsError && (
        <div className="mt-6">
          <AdminOverdueLeadsPanel
            leads={(leads ?? []) as CrmLeadRow[]}
            followUps={(followUps ?? []) as CrmFollowUpWithLead[]}
            agents={(agents ?? []) as CrmUserRow[]}
          />
        </div>
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
