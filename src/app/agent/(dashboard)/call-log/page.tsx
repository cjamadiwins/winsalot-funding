import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import type { CallLogRow } from "@/lib/call-log";
import { createGrowthCallLogAction } from "./actions";

export default async function GrowthAgentCallLogPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("crm_call_logs")
    .select("id, created_at, agent_id, business_name, phone, outcome, notes")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <AgentCallLogClient
      crmLabel="Growth CRM"
      records={(data ?? []) as CallLogRow[]}
      createAction={createGrowthCallLogAction}
    />
  );
}
