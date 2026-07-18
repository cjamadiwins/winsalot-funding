import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { CrmLeadRow } from "@/lib/crm-types";
import AgentDashboardClient from "./AgentDashboardClient";

export default async function AgentDashboardPage() {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_leads_agent_select_own) already restricts this to leads
  // assigned to the signed-in agent, so no extra filtering is needed here.
  const { data, error } = await supabase
    .from("crm_leads")
    .select("*")
    .order("created_at", { ascending: false });

  const leads = (data ?? []) as CrmLeadRow[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
            My Leads
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

      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load leads: {error.message}
        </p>
      )}

      {!error && <AgentDashboardClient leads={leads} />}
    </div>
  );
}
