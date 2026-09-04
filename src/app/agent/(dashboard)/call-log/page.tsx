import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import { GROWTH_CRM_BUSINESS_CLIENT_NAME, type CallLogRow } from "@/lib/call-log";
import { createGrowthCallLogAction } from "./actions";

type CrmCallLogRecord = Omit<CallLogRow, "businessClient"> & { business_client_name: string };

export default async function GrowthAgentCallLogPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("crm_call_logs")
    .select("id, created_at, agent_id, business_name, phone, outcome, notes, business_client_name")
    .order("created_at", { ascending: false })
    .limit(100);

  const records: CallLogRow[] = ((data ?? []) as CrmCallLogRecord[]).map(({ business_client_name, ...rest }) => ({
    ...rest,
    businessClient: business_client_name,
  }));

  return (
    <AgentCallLogClient
      crmLabel="Growth CRM"
      records={records}
      createAction={createGrowthCallLogAction}
      businessClientField={{ mode: "fixed", value: GROWTH_CRM_BUSINESS_CLIENT_NAME }}
    />
  );
}
