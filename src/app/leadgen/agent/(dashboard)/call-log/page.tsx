import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import type { CallLogRow } from "@/lib/call-log";
import { createLeadgenCallLogAction } from "./actions";

export default async function LeadgenAgentCallLogPage() {
  await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("leadgen_call_logs")
    .select("id, created_at, agent_id, business_name, phone, outcome, notes")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <AgentCallLogClient
      crmLabel="Lead Generation CRM"
      records={(data ?? []) as CallLogRow[]}
      createAction={createLeadgenCallLogAction}
    />
  );
}
