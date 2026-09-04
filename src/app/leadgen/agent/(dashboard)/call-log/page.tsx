import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import type { CallLogClientOption, CallLogRow } from "@/lib/call-log";
import { createLeadgenCallLogAction } from "./actions";

type CampaignRow = { id: string; client_id: string };
type ClientRow = { id: string; name: string };

export default async function LeadgenAgentCallLogPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const [{ data: logData }, { data: campaignData }, { data: clientData }] = await Promise.all([
    supabase
      .from("leadgen_call_logs")
      .select("id, created_at, agent_id, client_id, business_name, phone, outcome, notes")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("leadgen_campaigns").select("id, client_id").eq("status", "active"),
    supabase.from("leadgen_clients").select("id, name").order("name"),
  ]);

  const campaigns = (campaignData ?? []) as CampaignRow[];
  const allowedClientIds = new Set(campaigns.map((campaign) => campaign.client_id));
  const clients: CallLogClientOption[] = ((clientData ?? []) as ClientRow[])
    .filter((client) => allowedClientIds.has(client.id))
    .map((client) => ({ id: client.id, name: client.name }));
  const clientNameById = new Map(clients.map((client) => [client.id, client.name]));
  const currentCampaign = campaigns.find((campaign) => campaign.id === agent.current_campaign_id);
  const defaultClientId = currentCampaign?.client_id ?? clients[0]?.id ?? "";
  const records = ((logData ?? []) as CallLogRow[]).map((record) => ({
    ...record,
    client_name: record.client_id ? clientNameById.get(record.client_id) ?? null : null,
  }));

  return (
    <AgentCallLogClient
      crmLabel="Lead Generation CRM"
      records={records}
      clients={clients}
      defaultClientId={defaultClientId}
      createAction={createLeadgenCallLogAction}
    />
  );
}
