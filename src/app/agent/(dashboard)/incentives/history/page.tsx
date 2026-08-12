import Link from "next/link";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { WinsalotAgentIncentiveLedgerRow } from "@/lib/agent-incentive-shared";
import AgentIncentiveHistoryTable from "@/components/crm-ui/AgentIncentiveHistoryTable";

export default async function CrmAgentIncentiveHistoryPage() {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (winsalot_agent_incentive_ledger_agent_select_own) already
  // restricts this to rows this agent's own crm_users id is attached to
  // - no extra filtering needed.
  const { data } = await supabase
    .from("winsalot_agent_incentive_ledger")
    .select("*")
    .eq("crm", "cleaning")
    .eq("source_crm_user_id", crmUser.id)
    .order("week_start", { ascending: false });

  return (
    <div>
      <Link href="/agent/dashboard" className="text-[12.5px] font-semibold text-[var(--crm-accent)] hover:opacity-80">
        ← Back to Dashboard
      </Link>
      <h1 className="mt-2 font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">My Weekly Incentive History</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Every week your Weekly Incentive has been reviewed by an admin, most recent first.
      </p>

      <AgentIncentiveHistoryTable rows={(data ?? []) as WinsalotAgentIncentiveLedgerRow[]} recordLabel="Qualified Quotes" />
    </div>
  );
}
