import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { getNextPayday, type PayrollRecord } from "@/lib/payroll";
import MyPayView from "@/components/payroll/MyPayView";

export default async function LeadgenAgentPayPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_payroll_agent_select_own) restricts this to this agent's
  // own rows regardless of the .eq() below - the filter here is just for
  // query efficiency, not the security boundary.
  const { data: records, error } = await supabase
    .from("leadgen_payroll")
    .select("*")
    .eq("agent_id", agent.id)
    .order("payday", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Pay</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your biweekly pay, in Nigerian Naira (₦). Only you can see this information.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load your pay information: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <MyPayView nextPayday={getNextPayday()} records={(records ?? []) as PayrollRecord[]} />
        </div>
      )}
    </div>
  );
}
