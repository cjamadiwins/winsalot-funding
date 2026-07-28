import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";
import AgentLeadsListClient from "./AgentLeadsListClient";

export default async function LeadgenAgentLeadsPage() {
  await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { data: leads } = await supabase.from("leadgen_leads").select("*").order("next_follow_up_at", { ascending: true, nullsFirst: false });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Leads</h1>
      <p className="mt-1 text-sm text-slate-500">Prospects assigned to you.</p>
      <AgentLeadsListClient leads={(leads ?? []) as LeadgenLeadRow[]} />
    </div>
  );
}
