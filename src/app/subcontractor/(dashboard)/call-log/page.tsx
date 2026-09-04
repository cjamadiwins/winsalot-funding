import { requireCrmSubcontractor } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import { GROWTH_CRM_BUSINESS_CLIENT_NAME, type CallLogRow } from "@/lib/call-log";
import { createSubcontractorCallLogAction } from "./actions";

type CrmCallLogRecord = Omit<CallLogRow, "businessClient"> & { business_client_name: string };

export default async function SubcontractorCallLogPage() {
  const me = await requireCrmSubcontractor();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("crm_call_logs")
    .select("id, created_at, agent_id, business_name, phone, outcome, notes, business_client_name")
    .eq("agent_id", me.id)
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
      createAction={createSubcontractorCallLogAction}
      businessClientField={{ mode: "fixed", value: GROWTH_CRM_BUSINESS_CLIENT_NAME }}
    />
  );
}
