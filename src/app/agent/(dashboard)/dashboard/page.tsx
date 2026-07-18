import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { CrmFollowUpWithLead, CrmLeadRow } from "@/lib/crm-types";
import AgentDashboardClient from "./AgentDashboardClient";
import FollowUpCalendar from "./FollowUpCalendar";

export default async function AgentDashboardPage() {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_leads_agent_select_own / crm_followups_agent_select_own_lead)
  // already restricts both of these to leads assigned to the signed-in
  // agent, so no extra filtering is needed here.
  const [{ data: leadsData, error: leadsError }, { data: followUpsData, error: followUpsError }] =
    await Promise.all([
      supabase.from("crm_leads").select("*").order("created_at", { ascending: false }),
      supabase
        .from("crm_followups")
        .select("*, crm_leads(id, business_name, phone, city, assigned_agent_id)")
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true }),
    ]);

  const leads = (leadsData ?? []) as CrmLeadRow[];
  const followUps = (followUpsData ?? []) as CrmFollowUpWithLead[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Welcome back, {crmUser.full_name || crmUser.email}.
          </p>
        </div>
        <Link
          href="/agent/leads/new"
          className="whitespace-nowrap rounded-full bg-[var(--color-accent)] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          + Add Lead
        </Link>
      </div>

      <h2 className="mt-8 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        Follow-Up Calendar
      </h2>
      {followUpsError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load your follow-up calendar: {followUpsError.message}
        </p>
      )}
      {!followUpsError && (
        <div className="mt-3">
          <FollowUpCalendar followUps={followUps} leads={leads} />
        </div>
      )}

      <h2 className="mt-10 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        My Leads
      </h2>

      {leadsError && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load leads: {leadsError.message}
        </p>
      )}

      {!leadsError && <AgentDashboardClient leads={leads} />}
    </div>
  );
}
