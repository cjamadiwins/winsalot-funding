import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { WinsalotAgentIncentiveLedgerRow } from "@/lib/agent-incentive-shared";
import AgentIncentiveHistoryTable from "@/components/crm-ui/AgentIncentiveHistoryTable";

export default async function LeadgenAgentIncentiveHistoryPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  // RLS (winsalot_agent_incentive_ledger_agent_select_own) already
  // restricts this to rows this agent's own leadgen_users id is
  // attached to - no extra filtering needed.
  const { data } = await supabase
    .from("winsalot_agent_incentive_ledger")
    .select("*")
    .eq("crm", "leadgen")
    .eq("source_leadgen_user_id", agent.id)
    .order("week_start", { ascending: false });

  return (
    <div>
      <Link href="/leadgen/agent" className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
        ← Back to Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">My Weekly Incentive History</h1>
      <p className="mt-1 text-sm text-slate-500">Every week your Weekly Incentive has been reviewed by an admin, most recent first.</p>

      <AgentIncentiveHistoryTable rows={(data ?? []) as WinsalotAgentIncentiveLedgerRow[]} recordLabel="Qualified Appointments" />
    </div>
  );
}
