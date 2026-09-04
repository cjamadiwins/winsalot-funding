import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import { requireGrowthSubcontractor } from "@/lib/subcontractor-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CallLogRow } from "@/lib/call-log";
import { createSubcontractorCallLogAction } from "../actions";

export default async function Page() {
  const subcontractor = await requireGrowthSubcontractor(); const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("crm_subcontractor_call_logs").select("id, created_at, subcontractor_id, business_name, phone, outcome, notes, business_client_name").eq("subcontractor_id", subcontractor.id).order("created_at", { ascending: false }).limit(100);
  let clientName = "Winsalot Corp.";
  if (subcontractor.business_client_id) { const { data: client } = await getSupabaseAdmin().from("crm_clients").select("company_name").eq("id", subcontractor.business_client_id).maybeSingle(); if (client?.company_name) clientName = client.company_name; }
  const records: CallLogRow[] = (data ?? []).map((row) => ({ id: row.id, created_at: row.created_at, agent_id: row.subcontractor_id, business_name: row.business_name, phone: row.phone, outcome: row.outcome, notes: row.notes, businessClient: row.business_client_name })) as CallLogRow[];
  return <AgentCallLogClient crmLabel="Subcontractor Portal" records={records} createAction={createSubcontractorCallLogAction} businessClientField={{ mode: "fixed", value: clientName }} />;
}
