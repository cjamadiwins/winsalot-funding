import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import type { ProviderFollowUpWithLead, ProviderLeadRow } from "@/lib/provider-types";
import ProviderAcquisitionAdminClient from "./ProviderAcquisitionAdminClient";

export default async function AdminProviderAcquisitionPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  // RLS (provider_leads_admin_all / crm_users_admin_select_all /
  // crm_followups_admin_all) permits a full read here since this page is
  // already gated by requireCrmAdmin().
  const [
    { data: providers, error: providersError },
    { data: agents, error: agentsError },
    { data: followUps, error: followUpsError },
  ] = await Promise.all([
    supabase.from("provider_leads").select("*").order("created_at", { ascending: false }),
    supabase.from("crm_users").select("*").order("full_name"),
    supabase
      .from("crm_followups")
      .select("*, provider_leads(id, business_name, contact_person, phone, email, status, assigned_agent_id)")
      .eq("status", "pending")
      .not("provider_lead_id", "is", null)
      .order("scheduled_at", { ascending: true }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Provider Acquisition</h1>
          <p className="mt-1 text-sm text-slate-500">
            Recruit and onboard cleaning providers — separate from customer quote requests and
            cleaning opportunities.
          </p>
        </div>
        <Link
          href="/admin/crm/provider-acquisition/new"
          className="whitespace-nowrap rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          + Add Provider Lead
        </Link>
      </div>

      {(providersError || agentsError || followUpsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load provider data: {(providersError ?? agentsError ?? followUpsError)?.message}
        </p>
      )}

      {!providersError && !agentsError && !followUpsError && (
        <div className="mt-6">
          <ProviderAcquisitionAdminClient
            providers={(providers ?? []) as ProviderLeadRow[]}
            agents={(agents ?? []) as CrmUserRow[]}
            followUps={(followUps ?? []) as ProviderFollowUpWithLead[]}
          />
        </div>
      )}
    </div>
  );
}
